# 23 — 审批人引用检索工具 + 停用提醒

**What to build:** ADR-0015 决策 2+4 的落地。管理员检索「某用户被哪些模板审批链引用」（直接引用 + 角色成员；**org_structure 不纳入**——链不指名用户，改了没用），逐模板跳转编辑（MVP **不做批量替换**）；停用用户时列出引用并提醒（**不拦截**，可带引用停用）。

**Blocked by:** 22 — 审批人停用/删除治理（复用其「审批链引用查询」helper）

**Status:** done（2026-08-22，TDD 全绿）

**现状（2026-08-22 代码核实）：**
- 无任何 JSONB 引用检索端点（server 全库无 `approval_chain @>` 查询）。`/approvers/options`（`approvers.ts`）是设计器审批人/角色选择器（工单 10），**不是**引用检索。
- `PATCH /users/:id` 停用（`users.ts:280-332`）已存在且可用，但停用时**零引用检测**——无提醒、无列表、无跳转。
- 客户端管理端「账号治理」UI 已就位（`UsersPage.tsx`：状态筛选、已停用徽章、`is_active` 编辑框），衔接点明确。

- [x] **检索端点**：`GET /api/v1/users/:id/approval-references`（`users.ts`）——返回引用模板列表：
  - 直接引用：`specific.userId = userId`
  - 角色成员：取该用户持有的角色集合 → `role.roleId ∈ 集合`（引用判定按角色，非逐用户）
  - **org_structure 排除**
  - 复用工单 22 的 `templatesReferencingUser` / `templatesReferencingRole`（合并逻辑在 `approvalRefs.ts#approvalReferencesForUser`：同一模板被直接+角色引用时去重合并，refTypes 数组标注两种）
- [x] **openapi**：`openapi.yaml` 建模（`ApprovalReferenceItem` / `ApprovalReferenceListResponse` + 路径）+ `npm run generate:api`
- [x] **前端 — 检索列表**（管理端「账号治理」）：`UsersPage.tsx` 每行「查看引用」→ `ApprovalRefsDialog` 弹层（模板名 + 状态徽章 + 引用类型：直接/角色成员（角色名））→ 跳转设计器 `/designer/templates/:id`；**无批量替换入口**
- [x] **前端 — 停用提醒**（`UserEditor` 停用确认）：保存时勾掉「启用该账号」→ 调引用查询——引用 > 0 → 内联确认视图（警告「可继续停用；提交到被停用审批人的实例将被拦截」+ 引用列表 + 逐条跳转链接）→「确认停用」才发 PATCH；引用 = 0 → 直接停用。**停用不拦截**
- [x] **测试**：
  - server 端点（`users.test.ts`，6 用例）：直接引用命中 / 角色成员命中 / 直接+角色合并 / org_structure 不命中 / 无引用空 / 404
  - 前端（`UsersPage.test.tsx`，3 用例）：查看引用弹层列表+跳转 / 停用无引用直接 PATCH / 停用有引用先确认后 PATCH
- [x] **验证**：`npm run typecheck` + shared/server/client 测试全绿（122 / 137 / 180）

> 关联：ADR-0015（决策 2、4）；工单 22（引用查询 helper）；BUG-01（用户管理 CRUD 衔接）；CONTEXT.md「停用」。
