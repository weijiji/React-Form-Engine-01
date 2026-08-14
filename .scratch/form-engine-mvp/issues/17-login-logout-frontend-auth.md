# 17 — 登录 / 登出前端 + 业务路由接入 JWT

**What to build:** 补齐前端认证链路（登录页、路由守卫、真实用户态、登出入口），并把业务路由从旧的 `X-User-Id` 身份解析迁移到 JWT 认证，让「按角色进 5 门户」真正落地。

**Blocked by:** 09 — 认证 + RBAC 权限（后端 API 已就绪）、16 — 5 角色门户路由（门户骨架已就绪）

**Status:** done

- [x] **后端 — 业务路由接入 JWT**：`templates` / `instances` / `drafts` 从 `resolveCurrentUser`（`X-User-Id` header，缺失回退种子用户张三）迁移到 `authenticate`；删除 `middleware/currentUser.ts` 与旧 `routes/me.ts`（`GET /api/v1/me` 由 `GET /api/v1/auth/me` 取代）
- [x] **后端 — 种子重写为 5 角色**：角色 = 管理员 / 设计者 / 填写者 / 审批者 / 运维，权限码按门户拆分（管理员全 20 码；设计者 7 个 `template:*`；填写者 `form:fill/submit/withdraw`；审批者 5 个 `approval:*`；运维复用 `template:import/export` + `data:view/view_stats`）。新增 `designer@example.com`、`ops@example.com`；张三赋「填写者 + 审批者」双角色
- [x] **前端 — 认证上下文**：`client/src/auth/` 下 `AuthProvider` + `useAuth()`（暴露 `user/roles/permissions/loading/login/logout`）+ `RequireAuth` 路由守卫
- [x] **前端 — apiClient 认证**：新增 `login` / `logout` / `me` / `refresh` 方法；全局 401 → 静默调 `/auth/refresh` 重试 → 失败跳 `/login`；403 → `/403`
- [x] **前端 — 登录页**：`/login` 路由（邮箱 + 密码表单）；`INVALID_CREDENTIALS` 统一「账号或密码错误」；429 限流提示；`?redirect` 仅允许站内相对路径
- [x] **前端 — 路由守卫 + 角色重定向**：5 门户包 `RequireAuth`；`/` 按角色优先级（管理员>设计者>填写者>审批者>运维）重定向；新增 `/403` 页
- [x] **前端 — Shell 用户区**：硬编码假用户替换为 `useAuth` 真实用户；新增「退出登录」（`POST /auth/logout` → 清态 → `/login`）与「切换门户」菜单（按实际角色）
- [x] 验证：`npm run typecheck` + `npm run build` + 测试全绿；未登录访问受保护路由跳 `/login`；登录后按角色落对应门户；登出后回到 `/login`
