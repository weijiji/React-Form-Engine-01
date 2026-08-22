# BUG-15 — 角色型审批节点只取角色内「第一个」成员：多人角色中除首人外永不派发

**Status:** open
**记录日期:** 2026-08-22
**来源:** 现场使用（工单 06 审批引擎 + 审批操作 UI）

## 现象

管理员新建审批者角色「IT设备申领表 - 审批者」，并把**李四、王五两人**都加入该
角色；随后创建「IT设备申领表」，审批链节点1 = 角色「IT设备申领表 - 审批者」、
节点2 = 「系统管理员」，发布。张三（申请人）提交后，审批**总是自动派发给李四**，
**王五永不派发**——无论提交多少次，王五的待审批列表始终为空。

## 复现步骤

1. 管理员新建角色「IT设备申领表 - 审批者」，成员加入 李四、王五
2. 管理员在设计器新建「IT设备申领表」：审批节点1 审批规则 = 「指定角色 →
   IT设备申领表 - 审批者」，节点2 = 指定人员「系统管理员」；发布
3. 张三（申请人）从表单中心「填写」并提交该模板
4. 李四登录 → 待审批列表出现该单；王五登录 → 待审批列表为空
5. 反复多提交几单 → 每次都派给李四，王五始终收不到任何一单

## 期望行为

角色型审批节点的语义应与产品约定一致——需产品确认（候选）：
- **全员审批**：角色内所有成员各生成一条待办，任一（或全部）审批后节点流转；或
- **轮流指派**：多人之间按某种策略（如 round-robin）公平分配，而非永远第一个人；
- 即便维持「任一成员」，也应**确定性地**选择（当前无排序，结果不可预期）并向
  设计者说明「角色节点 = 指派给该角色某一成员」。

## 实际行为

- 提交时 `role` 规则解析（`shared/src/approvalResolver.ts`）：
  `getUsersByRole(roleId)` 返回角色**全部成员**，随后
  `resolveFromActiveMember` 用 `pickActive(users)` 取**第一个启用成员**
  （`users.find(u => u.isActive !== false)`）——只产出**一个**审批人
- 王五作为第二个成员**从不参与**；且 `getUsersByRole`
  （`server/src/services/orgDataSource.ts:71`）**无 ORDER BY**，「第一个」取决于
  数据库返回顺序，**不确定**（同角色成员顺序变化会改变被指派者）
- 代码头部注释将其标为「MVP simplification」：`role — first active user in the
  role via getUsersByRole`（`approvalResolver.ts` 头注释）；`department_manager`
  同类处理（取部门第一人）
- 与 CONTEXT.md / ADR-0015 描述不符：`角色引用自动路由给存活成员（无需改链）`
  ——「路由给存活成员」易被理解为成员间分配，实现却只路由给「第一个」

## 涉及范围

- 引擎：`shared/src/approvalResolver.ts`（`pickActive` / `resolveFromActiveMember`
  —— 只取首个启用成员；`role` 与 `department_manager` 共用此单成员语义）
- 服务端：`server/src/services/orgDataSource.ts:71`（`getUsersByRole` 无排序）、
  `server/src/services/approval.ts`（`resolveApprovalChain` 逐节点产出单记录）
- 契约/文档：`shared/src/types.ts`（`ApproverRule.role` 语义未定义多人分配）、
  `docs/adr/0015-approval-chain-reference-governance.md`、CONTEXT.md「审批链引用」
- 前端：设计器 `PropertyPanel.tsx`「指定角色」选项（可选角色，但未提示多人语义）

## 根因分析

`role`（及 `department_manager`）的解析实现是「从成员列表选一人」的简化版，
而产品/契约层没有定义「角色含多人时如何分配」——导致行为是**隐式的、非确定性的
单选**：永远命中列表第一个启用成员，其余成员形同虚设。多人角色场景（尤其「某岗位
多人轮值」）是常见业务需求，当前实现既不公平（李四忙死、王五闲置）、也不可预期
（无排序）。这是「实现简化被当作产品语义」的典型缺口。

## 严重程度 / 优先级

中-高（P1）。角色型审批节点的**核心语义缺失**：多人角色除首个成员外全部收不到
待办，业务上「角色轮值 / 多人协作审批」无法成立；且当前选择无确定性排序，
行为不可预期。**需产品确认角色节点语义**（全员 / 轮流 / 任一）后再定实现。

## 建议修复方向（参考）

1. 产品确认语义（决策点）：
   - 全员审批 → 每个成员各生成一条 pending 记录，节点流转需「任一通过」或
     「全部通过」策略（影响 `approve` 推进逻辑与 `approval_records` 结构，改动大）
   - 轮流指派 → 需在 `form_instances`/记录上带派发序号或按实例计数做 round-robin
   - 任一成员（维持现状）→ 至少：`getUsersByRole` 加确定性排序（如
     `orderBy("u.created_at")`/`u.id`），并把「角色节点 = 指派给角色某一成员」写入
     契约与设计器提示
2. 契约：在 `shared/src/types.ts` 与 `openapi.yaml` 注释明确 `role` 节点的多人语义；
   SchemaParser 可不拦（语义层决策），但文档必须说清
3. 测试：角色含 2+ 成员 → 断言当前行为（首个成员被派发）以便语义变更时锁定回归；
   若定全员/轮流，补对应分发用例
4. 与 BUG-10（审批链快照）无关但同属审批解析域，建议排期时合并评审

## 关联

- `issues/06-approval-engine-operations-ui.md`（工单 06）、`issues/10-approval-chain-config.md`
- ADR-0015（审批链引用治理：角色成员解析、停用兜底）
- CONTEXT.md「审批链引用」（「角色引用自动路由给存活成员」语义）
- 同类简化：`department_manager`（取部门第一人）——若角色语义定稿，建议一并评审
