# BUG-13 — 审批操作全部 409「当前审批节点不匹配」：设计器存 0 基 `order`，服务端守卫按 1 基 `node_order` 判定（差一错误）

**Status:** fixed
**记录日期:** 2026-08-22
**修复日期:** 2026-08-22
**来源:** 现场使用（工单 06 审批引擎 + 审批操作 UI）

## 现象

管理员在设计器新建「出差申请表」，新增审批节点0=李四、节点1=系统管理员并发布。
张三（申请人）提交后，李四（审批人）在审批详情页执行**同意 / 拒绝 / 退回 / 转交**
四个动作，**全部**返回 `当前审批节点不匹配，请刷新后重试`（页面已刷新仍复现）。

## 复现步骤

1. 管理员在设计器新建模板，添加审批链：节点0 = 指定人员「李四」，节点1 = 指定人员
   「系统管理员」，发布
2. 张三（申请人）从表单中心「填写」并提交该模板（生成 2 条 `approval_records`，
   `current_node_index = 0`）
3. 李四登录 → 待审批列表可见该单 → 进入审批详情页
4. 依次点击「同意」「拒绝」「退回」「转交」并确认 → **全部**提示
   「当前审批节点不匹配，请刷新后重试」
5. 对比：用种子模板「IT设备申领表」（其审批链 `order: 1 / order: 2`）走同一流程则
   **正常**——故现场误以为偶发，实为设计器新建模板必现

## 期望行为

设计器新建的模板，其首个节点审批人能正常执行同意/拒绝/退回/转交；审批链按
节点顺序依次推进（节点0审批后 `current_node_index` 前进到节点1）。

## 实际行为

- 设计器保存审批链节点 `order` 为 **0 基**：`DesignerPage.tsx:280` 新增节点
  `order: prev.nodes.length`（首节点 0），`:294/:307` 增删/移动后重排 `order: i`
  （0,1,2…）
- 提交时 `node_order = node.order`（`services/approval.ts:54`）→ 李四记录的
  `node_order = 0`；提交后 `current_node_index = 0`（`instances.ts` submit）
- 服务端守卫按 **1 基**判定（`approvals.ts:110`）：
  `record.node_order - 1 !== instance.current_node_index` →
  `0 - 1 = -1 !== 0` → **409 APPROVAL_NOT_PENDING「当前审批节点不匹配」**
- 四个动作共用同一守卫（`loadActionContext`），故**同意/拒绝/退回/转交全部失败**
- 种子数据/服务端测试用 **1 基**（`001_seed_data.ts:366,375` `order:1,2`；
  `approvals.test.ts:125,136` 断言 `node_order` 为 1、2）——被种子模板掩盖，
  集成测试全绿，只有设计器新建的模板命中

## 涉及范围

- 前端：`client/src/pages/designer/DesignerPage.tsx`（`handleAddChainNode` /
  `handleRemoveChainNode` / `handleMoveChainNode` 的 0 基 `order` 赋值）
- 后端：`server/src/routes/approvals.ts:110`（守卫 `node_order - 1`）、`:357-363`
  （推进 `current_node_index = next.node_order - 1`）、`server/src/services/approval.ts`
  （`order: node.order`）、`server/src/services/instances.ts`（`current_node_index`）
- 语义来源：`server/src/db/seeds/001_seed_data.ts`（1 基先例）、
  `shared/src/schemaParser.ts:324-342`（`order` 仅校验数值/去重/排序，未规定基数）
- 连带显示：待审批列表「第 {node_order} 级」（`ApprovalPendingList.tsx`）、
  审批链侧栏均受基数影响（设计器模板显示「第 0 级」）

## 根因分析

`ApprovalNode.order` 的**基数语义未统一**：设计器侧按「数组下标」写 0 基，
服务端审批执行按「第几个节点」写 1 基（配合 `current_node_index` 从 0 计数），
两者差 1。种子数据恰好是 1 基，掩盖了差异；SchemaParser 对 `order` 只校验
有限数值与去重、不做基数规约，设计器产生的 0 基数据直接透传到 `node_order`，
在首个节点审批即触发差一错误，后续推进（`node_order - 1`）同样错位。

## 严重程度 / 优先级

**高（P0）**。工单 06 的审批操作核心功能对「设计器新建模板」完全不可用——
同意/拒绝/退回/转交四操作全部失败；仅种子模板能走通。直接阻断审批主流程。

## 建议修复方向（参考）

1. 统一基数（二选一，需契约定稿）：
   - 方案 A：设计器改存 **1 基** `order`（新增 `prev.nodes.length + 1`、重排
     `i + 1`），与种子/服务端测试对齐；存量 0 基模板需迁移/归一
   - 方案 B：服务端归一——提交时 `node_order = order + 1`（或守卫/推进改为按
     `order` 0 基语义计算，`record.node_order === current_node_index`）
2. 契约：在 `shared/src/types.ts` / `openapi.yaml` 明确 `ApprovalNode.order` 与
   `current_node_index` 的基数并加注释；`SchemaParser` 可加基数校验或归一
3. 测试：新增「设计器新建模板（0 基 or 1 基）→ 提交 → 首节点四动作全部通过 →
   推进到次节点」集成用例；补「第 X 级」展示断言
4. 存量数据：扫描 `form_templates.schema/approval_chain` 中 0 基 `order` 模板，
   一次性迁移

## 关联

- `issues/06-approval-engine-operations-ui.md`（工单 06）
- `issues/10-approval-chain-config.md`（审批链配置）
- `server/src/routes/approvals.test.ts`（1 基语义先例）
- 同现场发现的 BUG-14（待审批列表「去审批」按钮无响应）

## 修复记录（2026-08-22）

**契约定稿**：`ApprovalNode.order` 与 `approval_records.node_order` 为**链内 1 基位置**（第 N 级，首个节点 = 1）；`current_node_index` 为其 0 基互补（`node_order - 1`）。设计器是唯一 0 基生产者，改为 1 基（方案 A）。

**改动**：
- `client/src/pages/designer/DesignerPage.tsx`：新增节点 `length + 1`、删除/移动重排 `i + 1`、加载归一（缺失或 <1 的旧 `order` 按 `i + 1` 修复）
- `shared/src/schemaParser.ts`：`order` 强制整数且 `>= 1`，0 基/负数/小数 → `APPROVAL_CHAIN_INVALID`
- `shared/src/types.ts` + `openapi.yaml`：注明基数契约
- `server/src/middleware/errorHandler.ts`：`SchemaParseError` → 422（此前 schema 解析错误落到 500）——旧 0 基链提交时**响亮失败**而非静默 409
- 无需数据迁移：DB 扫描确认现库仅 seed 模板（`order:1,2`），无 0 基存量

**回归测试**（均为先红后绿）：
- `server/src/routes/approvals.test.ts`「BUG-13」：设计器新建模板（1 基）→ 提交 → 首节点 approve 200 推进 / reject 200 终止；旧 0 基链提交 → 422 `APPROVAL_CHAIN_INVALID`
- `shared/test/schemaParser.test.ts`：拒绝 `order: 0` / `-1` / `1.5`

**验证**：shared 127 / server 168 / client 190 全绿，typecheck + check:css 通过。
