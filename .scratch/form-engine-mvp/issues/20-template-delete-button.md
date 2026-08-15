# 20 — 模板删除按钮（仅签出后可删，grilling 收敛）

**What to build:** 给设计器补上缺失的删除按钮（模板列表卡片 + 设计器内部），可见条件是**仅自己签出**；服务端 DELETE 补齐 `template:delete` 权限门禁 + 签出锁校验，杜绝绕过 UI 直接删。

**Blocked by:** 04 — 模板 API（checkout/checkin 锁机制已就绪）；19 — 共享控件组件库（按钮用 `<Button/>`）

**Status:** done (awaiting code review)

**需求（grilling + 用户四决策确认）：**
- 删除 = 一种「修改」，纳入独占锁：仅 **draft + 锁持有者（`locked_by === me`）+ 持有 `template:delete`** 可删。
- **可见条件**：仅自己签出时可见（未签出 / 他人签出 / 非 draft 均不显示删除入口）。
- **未签出删除**：必须先签出才能删（服务端兜底 409）。
- **后端校验**：`template:delete` 权限码（403）+ 签出锁（409 `TEMPLATE_LOCKED`）+ 现有 draft 校验（400 `TEMPLATE_NOT_DRAFT`）。

**现状：** `DELETE /api/v1/templates/:id`（e940946）只校验 `status === draft`，无权限码、无锁校验；前端两个位置均无删除按钮。`template:delete` 权限码已 seed（管理员/设计者角色），代码中无任何路由使用。

- [x] **后端**（`server/src/routes/templates.ts`）：
  - `DELETE /:id` 挂 `authenticate, requirePermission("template:delete")`
  - handler 校验顺序：`findTemplate` → `status !== "draft"` → 400 → `locked_by !== user.id` → 409（未签出：「模板未签出，请先签出后删除」；他人签出：「模板已被 xxx 签出，仅签出人可删除」）→ `del` → 204
- [x] **后端测试**（`templates.test.ts`，DELETE describe 改用有 `template:delete` 的用户——现有用例全用 zhangsan「填写者」会变 403）：
  - 有权限 + 锁持有者删草稿 → 204 后 404
  - 已发布 → 400（保持）
  - 未知模板 → 404（保持）
  - 有权限但非锁持有者删 → 409 `TEMPLATE_LOCKED`
  - 无 `template:delete`（lisi）→ 403 `FORBIDDEN`
  - 已签入（`locked_by` null）的 draft → 409 `TEMPLATE_LOCKED`
- [x] **openapi**（`openapi.yaml` `DELETE /templates/{id}`）：description 补锁语义 + 权限码；responses 加 `403`/`409`；`npm run generate:api` 重生成 `shared/src/api.ts`
- [x] **前端 — TemplatesPage 卡片菜单**：`template.locked_by === me.id` 时菜单加「删除」（危险样式，`window.confirm`，成功后刷新列表）；引入 `useAuth` 取 `me`
- [x] **前端 — DesignerPage 工具栏**：`isHolder` 时在发布按钮旁加删除按钮（危险样式，`window.confirm`「未保存改动将丢失」，成功后 `navigate` 回 `/designer/templates`）
- [x] **验证**：`npm run typecheck` + client/shared/server 测试 + `npm run check:css` 全绿

> **验证时发现的环境问题（与本次改动无关）**：`instances.test.ts` 两个 submit 用例曾失败，根因是本地开发库的 seed 数据过时——「IT设备申领表」的 `approval_chain` 只存了旧版单个节点（node-002 系统管理员），而当前 seed 源码是两节点（直属上级 + 系统管理员）；`runSeedIfEmpty` 在 users 非空时不重跑，模板停留在旧版。已手动 UPDATE 该模板的 `approval_chain` 对齐源码，测试随之全绿。**环境修复**：重置开发库（`docker compose down -v` 后重建）即可让全部 seed 数据与源码一致。

> **现场走查补全（2026-08-15）**：用户走查发现删除入口在「未签出」时不可达——根因是工单 04 前端从未接入签出（checkout），且设计器「返回」按钮会自动签入丢锁。经用户确认三决策后落地：①设计器未签出草稿加「签出并编辑」按钮（POST /checkout）；②返回不再自动签入，改为工具栏显式「签入」按钮；③发布锁保持现状（不要求锁）。另将已发布/已归档模板的状态文案从「未签出」改为「只读」，避免误导。
