# 09 — 认证 + RBAC 权限

**What to build:** JWT 登录/刷新/登出，httpOnly Cookie + CSRF Token 防护。管理员可创建角色、分配权限码、向用户分配角色。每个 API 端点通过权限中间件校验。

**Blocked by:** 01 — 项目脚手架 + 数据库

**Status:** done (verified against code 2026-08-22)

- [X] **认证 API**：
  - `POST /api/v1/auth/login` — 登录。返回 JWT（httpOnly, Secure, SameSite=Strict Cookie）+ CSRF Token（独立非 httpOnly Cookie，JS 可读）。速率限制：5 次/分钟/IP
  - `POST /api/v1/auth/refresh` — 刷新 Token（滑动过期：活跃用户自动续期，登录态 7 天）
  - `POST /api/v1/auth/logout` — 登出（清除 Cookie）
  - `GET /api/v1/auth/me` — 当前用户信息（含 roles + permissions）
- [X] **CSRF 防护**：所有非 GET/HEAD/OPTIONS 请求需 `X-CSRF-Token` Header → Express 中间件校验
- [X] **权限中间件**：每个受保护端点声明所需权限码（如 `template:create`、`approval:approve`），中间件比对当前用户的 permissions 集合 → 无权限返回 403
- [X] **权限 API**：
  - `GET/POST/PUT/DELETE /api/v1/roles` — 角色 CRUD。创建时至少勾选 1 个权限码
  - `GET/POST /api/v1/users/:id/roles` — 用户角色管理。一个用户可多角色（能力取并集）
  - `GET /api/v1/permissions` — 系统预定义权限码列表（共 20 个，见设计规格 §3.2）
- [X] **权限 UI**：角色列表 + 创建/编辑角色表单（权限码勾选）+ 用户角色分配（人员选择器 + 角色多选）
- [X] 集成测试：无权限访问端点 → 403；CSRF Token 缺失 → 403；Token 过期后刷新 → 新 Token；角色变更 → 下次请求即时生效
