# BUG-08 — 仅持 `admin:manage_users` 的有限管理员打开用户管理页报「加载用户失败：无权限执行此操作」

**Status:** open
**记录日期:** 2026-08-21
**来源:** 现场：管理员创建角色「有限权限的管理员」，仅授权码 `admin:manage_users`，分配给测试账号

## 现象

测试账号登录后，侧边栏「用户管理」可见（页面码 `admin:manage_users` 满足），
点击进入 `/admin/users` 后整页报错：「加载用户失败：无权限执行此操作」。

## 复现步骤

1. 以管理员创建角色「有限权限的管理员」，仅授予权限码 `admin:manage_users`
2. 将该角色分配给一个测试账号
3. 以测试账号登录 → 侧边栏可见「用户管理」（菜单门禁正常）
4. 点击进入 `/admin/users` → 页面显示「加载用户失败：无权限执行此操作」

## 期望行为

- 仅持 `admin:manage_users` 的用户能进入用户管理页并看到用户列表
- 页面自身不应被与页面码无关的次要请求拖垮

## 实际行为

- `GET /users`（要求 `admin:manage_users`）成功返回 200
- `GET /roles`（要求 `admin:manage_roles`）返回 403 `FORBIDDEN`
- 二者在同一 `Promise.all` 中，后者 403 使整体 reject → `.catch` 把 `/roles`
  的错误信息渲染为整页失败，用户列表不可见

## 涉及范围

- 前端：`client/src/pages/admin/UsersPage.tsx`（`load()` 中
  `Promise.all([apiClient('/users…'), apiClient('/roles')])`）
- 后端：`server/src/routes/roles.ts`（`GET /roles` 门禁 `admin:manage_roles`）
- 关联：`GET /roles` 与角色分配操作的权限码不一致——分配角色
  （`POST /users`、`POST /users/:id/roles`）只要求 `admin:manage_users`

## 根因分析

`UsersPage.load()` 无条件同时拉取 `/users` 与 `/roles`，但二者服务端门禁不同：
`/users` 需 `admin:manage_users`，`/roles` 需 `admin:manage_roles`。菜单/路由守卫
按 ADR-0010 只校验页面码 `admin:manage_users`（`ROUTE_CODES["/admin/users"]`），
因此用户能进页面；但页内 `/roles` 请求 403，`Promise.all` 整体 reject，
把次要请求的失败放大成整页失败（`GET /users` 本身成功）。

更本质的服务端不一致：角色分配是 `admin:manage_users` 的业务动作，而「列出角色
目录」（`GET /roles`）却是 `admin:manage_roles` 的动作——同一业务的两个环节
权限码不一致，客户端无法为 manage_users 用户拉取角色目录来支撑分配 UI。

## 严重程度 / 优先级

中（功能可见性错误：有权限的用户进不了页面；与 BUG-09 同源同场景，一并修复）

## 建议拆解

1. 方案 A：`UsersPage` 仅在持有 `admin:manage_roles` 时拉取 `/roles`，
   否则隐藏角色相关 UI（角色筛选下拉 / 分配角色 / 初始角色）
2. 方案 B：把 `GET /roles`（只读目录）放宽到 `admin:manage_users`
   （配合 BUG-09 的授权范围子集校验才安全）
3. 无论 A/B：`/roles` 失败不应拖垮整页——用 `Promise.allSettled` 或独立
   错误处理解耦两个请求

## 关联

- [BUG-09](./09-privilege-escalation-role-grant.md)（越权提权，同场景同源）
- ADR-0010（权限码驱动路由：页面码是导航与守卫唯一事实来源）
- `server/src/middleware/auth.ts`（`requirePermission`，AND 语义）
