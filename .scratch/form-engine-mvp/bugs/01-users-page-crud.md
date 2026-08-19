# BUG-01 — 用户管理页缺少增删改查完整能力（无新增/删除/编辑/筛选/分页）

**Status:** open
**记录日期:** 2026-08-19
**来源:** 现场勘查 `http://localhost:5173/admin/users`

## 现象

`/admin/users`（用户管理）页面当前只具备「查询展示 + 分配角色」两项能力，
缺少用户管理的完整 CRUD：没有【新增用户】【删除用户】入口，没有修改用户
明细（姓名/邮箱/启用停用）的能力，没有筛选条件版面，查询结果也没有分页。

## 复现步骤

1. 以管理员登录，进入 `/admin/users` 用户管理页
2. 观察工具栏：仅有标题「用户管理」，无「新增用户」按钮
3. 观察表格：每行操作列仅「分配角色」一个按钮，无「编辑」「删除」
4. 观察页面上方：无任何筛选/搜索条件
5. 观察表格底部：无分页控件；数据一次性全部渲染

## 期望行为

- 工具栏提供【新增用户】按钮 → 弹窗/表单创建用户（姓名、邮箱、初始角色等）
- 每行提供【编辑】按钮 → 可修改用户明细（姓名/邮箱/启用停用等）
- 每行提供【删除】按钮 → 删除用户（需考虑防误删与关联数据约束）
- 提供筛选条件版面（如按姓名/邮箱关键字、按角色、按启用状态过滤）
- 查询结果分页，与项目内其他列表（templates/forms/instances/drafts）一致

## 实际行为

- 无新增/删除/编辑入口；仅可「分配角色」
- 无筛选栏、无分页，全量渲染所有用户

## 涉及范围

- 前端：`client/src/pages/admin/UsersPage.tsx`、`client/src/pages/admin/types.ts`、`client/src/pages/admin/admin.css`
- 后端：`server/src/routes/users.ts`（当前仅 `GET /`、`GET /:id/roles`、`POST /:id/roles`）
- API 契约：`openapi.yaml`（`/api/v1/users` 目前仅建模 GET）
- 生成类型：`shared/src/api.ts`（需 `npm run generate:api` 重新生成）

## 根因分析

Work order 09（`issues/09-auth-rbac-permissions.md`）只实现了
「用户列表 + 角色分配」作为 RBAC 的最小闭环，未覆盖用户本体的增删改；
`GET /api/v1/users` 也未带分页/筛选参数。项目内其他列表端点
（`templates.ts` / `forms.ts` / `instances.ts` / `drafts.ts`）均已实现
`page / pageSize / total` 偏移分页，users 列表缺失属于明显不一致。

## 严重程度 / 优先级

中（MVP 内可接受，但属于用户管理核心能力缺口；用户量≈50 并发填写，
当前无分页尚不致命，量级增长后会成为问题）

## 建议拆解（若作为独立工单）

1. 后端：`GET /api/v1/users` 加分页（page/pageSize/total）+ 筛选（关键字/角色/状态）
2. 后端：新增 `POST /api/v1/users`（建号）、`PATCH /api/v1/users/:id`（改明细/启停）、`DELETE /api/v1/users/:id`
3. 契约：`openapi.yaml` 建模上述端点 + `shared/src/api.ts` 再生成
4. 前端：新增按钮、编辑/删除交互、筛选栏、分页控件；测试补齐（`client/src/pages/admin/UsersPage.test.tsx`）
5. 关联校验：删除用户需考虑其 FormInstance / ApprovalRecord / Draft 关联数据

## 关联工单

- `issues/09-auth-rbac-permissions.md`（现状来源）
- 分页先例参考：`server/src/routes/templates.ts`（`clampInt` + offset 分页模式）
