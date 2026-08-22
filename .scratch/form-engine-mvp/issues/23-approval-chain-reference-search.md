# 23 — 审批人引用检索工具 + 停用提醒

**What to build:** ADR-0015 决策 2+4 的落地。管理员检索「某用户被哪些模板审批链引用」（直接引用 + 角色成员；**org_structure 不纳入**——链不指名用户，改了没用），逐模板跳转编辑（MVP **不做批量替换**）；停用用户时列出引用并提醒（**不拦截**，可带引用停用）。

**Blocked by:** 22 — 审批人停用/删除治理（复用其「审批链引用查询」helper）

**Status:** ready-for-agent

**现状（2026-08-22 代码核实）：**
- 无任何 JSONB 引用检索端点（server 全库无 `approval_chain @>` 查询）。`/approvers/options`（`approvers.ts`）是设计器审批人/角色选择器（工单 10），**不是**引用检索。
- `PATCH /users/:id` 停用（`users.ts:280-332`）已存在且可用，但停用时**零引用检测**——无提醒、无列表、无跳转。
- 客户端管理端「账号治理」UI 已就位（`UsersPage.tsx`：状态筛选、已停用徽章、`is_active` 编辑框），衔接点明确。

- [ ] **检索端点**：`GET /api/v1/users/:id/approval-references`（spec-first，路径以 openapi 定稿为准）——返回引用模板列表：
  - 直接引用：`specific.userId = userId`
  - 角色成员：取该用户持有的角色集合 → `role.roleId ∈ 集合`（引用判定按角色，非逐用户）
  - **org_structure 排除**
  - 复用工单 22 的 `templatesReferencingUser` / `templatesReferencingRole`
- [ ] **openapi**：`openapi.yaml` 建模（含 response 形状：模板 id/name/status + 引用类型标注）+ `npm run generate:api`
- [ ] **前端 — 检索列表**（管理端「账号治理」，与 BUG-01 用户管理衔接）：选中用户 → 查引用 → 列表（模板名 + 状态 + 引用类型：直接/角色成员）→ 跳转设计器编辑该模板审批链（`/designer/templates/:id`，经既有签出流程）；**无批量替换入口**
- [ ] **前端 — 停用提醒**（`UsersPage.tsx` 停用确认）：调引用查询——引用 > 0 → 弹层/内联列出「被 N 个模板引用」+ 逐条跳转链接 + 明确「可继续停用；提交到被停用审批人的实例将被拦截」；引用 = 0 → 直接停用。**停用不拦截**
- [ ] **测试**：
  - server 端点：直接引用命中 / 角色成员命中 / org_structure 不命中 / 无引用返回空
  - 前端：停用确认框在「有引用」时显示提醒 + 跳转、「无引用」时直接停用
- [ ] **验证**：`npm run typecheck` + shared/server/client 测试全绿

> 关联：ADR-0015（决策 2、4）；工单 22（引用查询 helper）；BUG-01（用户管理 CRUD 衔接）；CONTEXT.md「停用」。
