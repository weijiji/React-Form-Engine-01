# BUG-09 — 越权提权：仅持 `admin:manage_users` 的用户可自行授予「管理员」角色

**Status:** open
**记录日期:** 2026-08-21
**来源:** 现场 BUG-08 的隐藏坑——「分配角色」按钮/接口无授权范围校验

## 现象

仅持有 `admin:manage_users` 的「有限权限的管理员」可通过
`POST /api/v1/users/:id/roles` 把任意角色（含全权限的「管理员」）授予任意用户
（含自己），实现垂直提权。集成测试已证实：越权授予返回 HTTP 200。

## 复现步骤

1. 管理员创建角色「有限权限的管理员」，仅授予 `admin:manage_users`
2. 分配该角色给测试账号，以该账号登录
3. 直接调用 `POST /api/v1/users/{自己ID}/roles`，`roleIds: [管理员角色ID]`
4. 返回 200，角色替换成功 → 该账号自此持有全部权限码
   （登录后 `GET /roles` 从 403 变为 200，权限立即生效）

## 期望行为

- 授予的目标角色权限集必须是调用者自身权限集的**子集**，否则 403 `FORBIDDEN`
- UI 上「分配角色」入口与可选角色列表也按此范围裁剪（客户端体验，非安全边界）

## 实际行为

- `POST /users/:id/roles` 仅校验 `admin:manage_users` + 角色存在性（`assertKnownRoles`）
- 无「被授予角色权限集 ⊆ 调用者权限集」检查 → 有限管理员可自授「管理员」角色（200）

## 涉及范围

- 后端：`server/src/routes/users.ts`
  - `POST /:id/roles`（行 209-234）
  - `POST /`（创建用户带 `roleIds`，行 140-193）
- 前端：`client/src/pages/admin/UsersPage.tsx`（「分配角色」按钮无权限门禁，行 204-210）

## 根因分析

角色分配接口把「管理用户」与「授予任意权限」画了等号：`requirePermission("admin:manage_users")`
只验证了调用者能管用户，没有验证调用者是否有权授予目标角色。属于 OWASP
失效的功能级访问控制（Broken Function Level Authorization）——低权限用户自提权为最高权限。

## 严重程度 / 优先级

高（垂直越权，击穿单租户 MVP 的信任根基；**P0**，先于 BUG-08 修复）

## 建议拆解

1. `POST /users/:id/roles`、`POST /users`：对每个目标角色做权限集子集校验
   （目标角色 permissions ⊆ 调用者 permissions），否则 403 `FORBIDDEN`
2. `GET /roles` 若对 manage_users 放开（BUG-08 方案 B），可选地只返回调用者可授予的角色
3. 前端「分配角色」对话框按可授予角色过滤（体验，非安全边界）

## 关联

- [BUG-08](./08-users-page-limited-admin-crash.md)（同场景，页面崩溃）
- `server/src/middleware/auth.ts`（`requirePermission`，AND 语义）
- 服务端集成测试：`server/src/routes/rbac.test.ts`「privilege escalation guard」红色用例
