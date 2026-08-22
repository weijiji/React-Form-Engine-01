# BUG-12 — 点击「填写」即创建空草稿实例，且草稿无法删除（误触即产生不可清理的脏数据）

**Status:** open
**记录日期:** 2026-08-22
**来源:** 现场使用（表单中心填写体验）

## 现象

在表单中心，用户**只是点了一下「填写」**（未填写任何信息即离开），「我的表单」
里就出现一笔「草稿」，且该草稿**没有任何删除/放弃入口**，一直挂着删不掉。
一次误触 → 一条不可清理的脏数据，体验诡异。

## 复现步骤

1. 进入表单中心（`/filler`），任意已发布模板点「填写」
2. 立即返回 / 直接关闭填单页（未填任何字段）
3. 进入「我的表单」（`/filler/instances/my`）→ 出现一条状态为「草稿」的记录
4. 尝试删除：该行操作列仅有「继续填写」一个按钮——**无「删除 / 放弃」**；
   填单页也无删除/放弃入口
5. 结果：空草稿无法删除，只能等待 2 年保留期后由后台任务自动清理（BR-15）

## 期望行为

- 点「填写」**进入填单页**即可，不应在用户输入任何内容前就落库创建草稿
- 或：允许删除/放弃空草稿（至少是未产生有效内容的草稿），误触可自行清理
- 参考：进入填单页后由「首次有实际编辑（脏）」再触发创建草稿，或提供明确的
  「放弃并删除」操作

## 实际行为

- `client/src/pages/filler/FormCenter.tsx` 的 `startFilling`：点「填写」立即
  `POST /api/v1/instances`（`{ template_id }`）→ 服务端当场插入一条
  `status: "draft"`、`field_values: {}` 的实例（`instances.ts:204-226`），随后
  `navigate` 进填单页——**草稿在点击瞬间即落库**，与用户是否填写无关
- 「我的表单」`MySubmissions.tsx`：draft 行操作列仅「继续填写」；无删除/放弃
- 填单页 `FormFillPage.tsx`：无删除/放弃按钮
- 服务端无 `DELETE /api/v1/instances/:id` 端点（实例路由仅 create/detail/values/
  submit/withdraw）
- 草稿保留期 2 年（BR-15，`draftRetention.ts`），过期才被隐藏/后台清理
  （`draftPurge.ts`、`instances.ts:163`）——幽灵草稿要挂很久

## 涉及范围

- 前端：`client/src/pages/filler/FormCenter.tsx`（`startFilling` 点击即建稿）、
  `client/src/pages/filler/MySubmissions.tsx`（草稿行无删除操作）、
  `client/src/pages/filler/FormFillPage.tsx`（无放弃入口）
- 后端：`server/src/routes/instances.ts`（`POST /instances` 立即创建 draft；
  无 delete 端点）
- 契约：`openapi.yaml` + `shared/src/api.ts`（如需新增删除/放弃端点）

## 根因分析

ADR-0014 将「草稿 = 实例」建模（instance IS the draft），导致「开始填写」被
直接实现为「创建实例」——前端为了拿实例 id 跳转，点击瞬间就 `POST /instances`
落库。而实例删除能力从未设计/实现：提交后可「撤回」回到草稿，但草稿本身
没有删除路径，只能依赖 2 年保留期的兜底清理。二者叠加形成「误触 → 不可清理
空草稿」的体验黑洞。

## 严重程度 / 优先级

中（体验怪异 + 误触产生脏数据：每次误点「填写」都多一条不可删除的草稿，
「我的表单」被空草稿污染；MVP 50 并发下影响有限，但属于明显的错误行为）。
P1。**建议产品确认**：草稿是否允许删除（删除对已提交实例无影响，仅影响 draft）。

## 建议修复方向（参考）

1. 方案 A（改动小）：填单页/我的表单增加「放弃并删除草稿」入口 + 服务端
   `DELETE /api/v1/instances/:id`（仅 owner、仅 `draft` 可删）
2. 方案 B（更彻底）：点击「填写」不落库，进入填单页后由首次实际编辑（脏）或
   autosave 才创建草稿；跳转用 template_id 而非 instance_id（涉及
   `useAutosave`、`FormFillPage` 的草稿标识改造，工作量更大）
3. 契约：`openapi.yaml` 建模 + `npm run generate:api`
4. 测试：误触场景（点击填写不输入 → 无草稿或可删除）、删除仅限 owner + draft、
   已提交实例删除被拒

## 关联

- `issues/05-form-submission-drafts-filler.md`（表单中心/填单/我的表单）
- ADR-0014（草稿实体合并：instance IS the draft）、BR-15（草稿保留期 2 年）
- CONTEXT.md「Draft」（草稿语义）
