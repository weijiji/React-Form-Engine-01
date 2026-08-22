# 22 — 审批人停用/删除治理：删除拦截 + 提交兜底

**What to build:** ADR-0015 决策 1+3 的落地。删除用户/角色前检查审批链引用（被引用 → 409 拒绝，先例 `USER_HAS_TEMPLATES`）；提交解析到**被停用**审批人 → 干净业务错误（事务回滚、可读信息，**不 500、不自动替换**）。

**Blocked by:** 无（自含；新增「审批链引用查询」helper 为公共前置，工单 23 复用）

**Status:** ready-for-agent

**现状（2026-08-22 代码核实）：**
- `users.ts` DELETE /:id（335-363）：守卫仅 `USER_SELF_OPERATION` / `LAST_ADMIN` / `USER_HAS_TEMPLATES`（创建过模板），**无审批链引用检查**；`roles.ts` DELETE /:id（159-168）只有权限守卫，零检查 → 硬删留下悬空引用。
- `shared/src/approvalResolver.ts`：`specific`(47-51)、`direct_manager`(67-71) **完全不看 `is_active`** → 停用者照常被解析、审批记录写给停用者 → 提交成功但**审批静默卡死**（停用者登录不了、动不了）。
- `preferActive`(22-24)：`find(u => u.isActive !== false) ?? users[0] ?? null` → **全员停用时回退选停用者**（role / department_manager 用此）。
- `server/src/services/approval.ts:38-42`：任何解析失败统一抛 500 `APPROVER_RESOLUTION_FAILED` → "被停用"也需要干净 4xx，而非 500。
- 停用能力本身已存在（`PATCH /users/:id` 支持 `is_active`，含自停用 / last-admin 守卫）；本次**不改动停用**（停用不拦截、仅提醒，见工单 23）。

- [ ] **前置 — 审批链引用查询 helper**（`server/src/services/approvalRefs.ts`）：
  - `templatesReferencingUser(userId)`：命中 `specific.userId = userId` 的模板列表
  - `templatesReferencingRole(roleId)`：命中 `role.roleId = roleId` 的模板列表
  - 实现：JSONB `@>` 包含查询（存储键为 camelCase：`nodes[].approverRule.userId / roleId`，与 work order 10 格式一致）；MVP 模板量小可全表扫描，量大再上 GIN 索引
- [ ] **删除拦截 — users**（`users.ts` DELETE /:id）：现守卫后追加引用检查——`templatesReferencingUser` 非空 → 409 新错误码 `USER_REFERENCED_IN_APPROVAL_CHAIN`，message 含可读信息（如「该用户被 N 个模板的审批链引用，请先处理引用后再删除」）
- [ ] **删除拦截 — roles**（`roles.ts` DELETE /:id）：`templatesReferencingRole` 非空 → 409 `ROLE_REFERENCED_IN_APPROVAL_CHAIN`
- [ ] **提交兜底 — resolver**（`shared/src/approvalResolver.ts`）：
  - `specific`：`getUser` 后加 `isActive !== false` 检查——停用 → `{ approver: null, reason: "指定审批人 <name> 已停用" }`
  - `direct_manager`：manager isActive 检查（同上）
  - `preferActive`：`find(u => u.isActive !== false)`，**去掉 `?? users[0]`**——全员停用返回 null；`role`/`department_manager` 分支 reason 改为「角色/部门下无启用用户」（顺带消掉"回退选停用者"边角）
- [ ] **提交兜底 — 错误语义**（`server/src/services/approval.ts`）：区分失败类别——解析到**被停用**审批人 → 干净 4xx（如 409/422，含节点标签 + 审批人姓名，如 `APPROVER_DISABLED`），事务回滚、不 500；「不存在 / 角色空」等**配置错误**维持 500 `APPROVER_RESOLUTION_FAILED`
- [ ] **测试**：
  - shared `approvalResolver.test.ts`：停用 specific → 不可解析；停用 direct_manager → 不可解析；角色全员停用 → 不可解析（断言**不再**回退选停用者）
  - server `users.test.ts`：被 `specific` 引用的用户删除 → 409；未引用 → 204
  - server `roles.test.ts`：被 `role` 引用的角色删除 → 409；未引用 → 204
  - submit 集成：模板 specific 审批人已停用 → 提交返回干净 4xx + 可读信息
- [ ] **openapi + 错误码**：`openapi.yaml` 补 DELETE users/roles 的 409 响应 + 新错误码（`USER_REFERENCED_IN_APPROVAL_CHAIN` / `ROLE_REFERENCED_IN_APPROVAL_CHAIN` / `APPROVER_DISABLED`）；`npm run generate:api`；错误码登记 `docs/spec-implementation-form-engine.md`
- [ ] **验证**：`npm run typecheck` + shared/server/client 测试全绿

> 关联：ADR-0015（决策 1、3）；CONTEXT.md「审批链引用」「停用」；工单 23 复用本单引用查询。
