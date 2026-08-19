# BUG-06 — 「我的模板」列表无数据隔离：不同账号可看到全部模板

**Status:** open
**记录日期:** 2026-08-19
**类型:** 数据隔离 / 越权可见

## 现象

在「我的模板」界面，两个不同的设计账号都能看到同一个模板 —— 列表
没有按模板归属（创建者）做数据隔离，任何账号都可见（并可能操作）全部模板。

## 复现步骤

1. 用账号 A（如 `designer@example.com`）登录，进入「我的模板」（`/designer/templates`），
   记录可见模板
2. 退出，用账号 B（如 `ops@example.com` 或另一设计者）登录，进入「我的模板」
3. 观察到账号 B 能看到与账号 A 完全相同的模板列表（含 A 创建的模板）

## 期望行为

- 「我的模板」仅列出当前登录用户自己创建的模板（按 `created_by` 隔离）
- 他人模板不可见；可见性策略需产品确认（如是否需要「全部模板 / 共享 / 协作」
  的显式区分，而非默认全量可见）

## 实际行为

- 列表全量返回所有模板，无创建者过滤

## 涉及范围

- 后端：`server/src/routes/templates.ts` —— `GET /api/v1/templates` 列表查询
  `base = db("form_templates")` 仅按 `category / status / search` 过滤，
  **未按当前用户 `created_by` 过滤**
- 前端：`client/src/pages/designer/TemplatesPage.tsx`（请求 `/templates` 时
  未携带创建者过滤参数）
- 关联：`GET /api/v1/templates/:id` 详情同样无归属校验

## 根因分析

模板列表端点未接入当前登录用户（`authenticate` 中间件未用于该列表路由，
查询无 `where({ created_by: user.id })`）；「我的模板」语义上应为个人
视图，但实现为全量视图。模板详情/编辑也缺少归属校验，
存在越权查看/操作他人模板的风险。

## 严重程度 / 优先级

中-高（单租户内数据隔离问题：MVP 多设计者协作时，他人模板被无差别暴露；
若模板含敏感业务结构，属越权可见风险）。**需产品确认可见性策略**：
默认「仅本人」还是需要显式的共享/全部视图开关。

## 建议修复方向（参考）

1. 产品确认：模板默认可见范围 = 本人创建（「我的模板」）？是否需要
   「全部模板（管理员）」视图？
2. 后端：`GET /api/v1/templates` 默认按 `created_by = 当前用户` 过滤；
   详情 / 编辑 / 发布等操作补归属校验（或按产品策略放权）
3. 契约：`openapi.yaml` 建模 `created_by` / 过滤参数 + `npm run generate:api`
4. 前端：列表按返回结果展示；必要时区分「我的 / 全部」页签
5. 测试：多账号隔离测试（A 创建的模板 B 不可见）

## 关联工单

- `issues/04-template-api-form-designer.md`（模板 API + 设计器）
- `issues/09-auth-rbac-permissions.md`（认证与权限）
- `docs/spec-implementation-form-engine.md`（错误码与测试缝）
