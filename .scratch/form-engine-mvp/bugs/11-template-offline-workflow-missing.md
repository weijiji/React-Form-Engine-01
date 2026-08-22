# BUG-11 — 系统缺少模板下架/停用流程：发布后无法下线，「archived」状态无任何入口

**Status:** fixed
**记录日期:** 2026-08-22
**修复日期:** 2026-08-22
**来源:** 现场勘查（模板生命周期使用体验）

## 现象

模板一经「发布」，即**永久**处于 `published` 状态：表单中心（填写入口）永远
展示该模板，填写者随时可点「填写」创建草稿并提交；系统**没有任何「下架 / 停用 /
归档」的流程**来停止模板继续被填写。类型/迁移里虽然存在 `archived` 状态，
但从 API 与 UI 均**无法到达**该状态。

## 复现步骤

1. 设计者发布一个模板（`POST /templates/:id/publish`）→ 状态为 `published`
2. 在表单中心（`/filler`）确认该模板出现在「可填写」列表
3. 尝试将其下线/停用：设计器顶栏仅有「签出并编辑 / 保存草稿 / 重新发布 / 签入 /
   删除」——**无「下架 / 停用 / 归档」按钮**；接口层也没有任何
   `offline / archive / disable` 端点
4. 删除也不可行：`DELETE /templates/:id` 仅允许 `draft` 状态（报
   `TEMPLATE_NOT_DRAFT`）；已发布模板因存在实例引用，设计上不可删
5. 结果：该模板在表单中心永久可见、永久可填写，业务上「模板已停用 / 已失效」
   无法落地

## 期望行为

- 提供「下架 / 停用」流程：模板可停止被填写（表单中心不再展示、`POST /instances`
  拒绝或引导），并可在需要时恢复（重新上架）
- `archived`（或新增的 offline 语义）应有明确的**进入/恢复**路径，而非只读死态
- 需要产品确认下架语义：软停用（可恢复）vs 归档（只读终态）vs 删除（含级联约束）

## 实际行为

- 状态机只有 `draft | published | archived`（`server/src/routes/templates.ts:39`、
  `server/src/db/migrations/001_initial_schema.ts:63`），且**没有**把模板置为
  `archived` 的端点——测试里是通过 `update({ status: "archived" })` 直接改库
  （`templates.test.ts:217/263/275/354`）来构造该状态，API 不可达
- 发布逻辑刻意保持 `published` 让填写入口常驻（`templates.ts:20-22`，BR-05
  「status stays published so the fill-in entry stays live」）
- `DELETE /templates/:id` 仅限草稿（`templates.ts:264-265` `TEMPLATE_NOT_DRAFT`）
- 表单中心 `GET /forms` 按 `published` 过滤展示 → 已发布模板永远出现在填写列表

## 涉及范围

- 后端：`server/src/routes/templates.ts`（状态机 / publish / delete，无下架端点）、
  `server/src/db/migrations/001_initial_schema.ts`（status 枚举）、
  `server/src/routes/instances.ts`（`POST /instances` 仅校验 `published`）
- 前端：`client/src/pages/designer/DesignerPage.tsx`（顶栏无下架入口）、
  `client/src/pages/filler/FormCenter.tsx`（填写列表）、
  `client/src/designer/statusModel.ts`（状态→配色映射需补语义）
- API 契约：`openapi.yaml` + `shared/src/api.ts`（需建模下架/恢复端点）

## 根因分析

模板生命周期只覆盖了「创建 → 发布（可反复重发布）」前半段，缺少「发布后下线 /
恢复」的收尾能力；`archived` 作为只读终态被预留，但既无生产者（无置档端点）、
也无恢复路径，属于**只读死态**。删除被限制在草稿（保护实例引用），使得
「发布后」的模板既不能下架、不能归档、也不能删除——生命周期不闭环。

## 严重程度 / 优先级

中-高（能力缺口 + 数据正确性影响：过期/失效模板无法下线，表单中心永久可见，
填写者仍可对已失效模板创建草稿并提交，产生无效数据；业务上「停用模板」无法落地）。
**需产品确认下架语义**（软停用可恢复 / 归档终态 / 是否允许强删及级联策略）。P1。

## 建议修复方向（参考）

1. 产品确认：下架后表单中心是否展示（置灰 + 不可填）还是完全隐藏；是否可恢复
2. 后端：新增 `POST /templates/:id/offline`（`published → offline`）与
   `POST /templates/:id/reopen`（`offline → published`，需签出/锁）；或将
   `archived` 落地为「下架终态」并打通进入/恢复路径；`POST /instances` 对
   offline 模板拒绝（复用 `TEMPLATE_NOT_PUBLISHED`）
3. 契约：`openapi.yaml` 建模 + `npm run generate:api`
4. 前端：设计器顶栏增加「下架 / 重新上架」入口；表单中心对下架模板隐藏或置灰；
   `statusModel.ts` 补 offline 语义色
5. 测试：下架后 `GET /forms` 不再返回、`POST /instances` 拒绝；恢复后重新可填

## 关联

- `issues/04-template-api-form-designer.md`（模板 API + 设计器）
- `issues/20-template-delete-button.md`（删除仅限草稿的既有实现）
- ADR-0012（模板归属/可见性）、BR-05（发布后填写入口常驻）
- `docs/spec-implementation-form-engine.md`（错误码与测试缝）
