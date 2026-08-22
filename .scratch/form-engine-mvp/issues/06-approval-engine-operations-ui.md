# 06 — 审批引擎 + 审批操作 UI

**What to build:** 审批人查看待审批列表 → 打开审批详情（表单只读 + 审批链时间线）→ 执行同意/拒绝/退回/转交 → 流程自动流转或终止。每个审批操作强制幂等键 + 乐观锁。

**Blocked by:** 05 — 表单提交 + 草稿 + 填写器

**Status:** done (shared engine + server approval routes + approver UI + 集成测试)

- [x] **审批 API**：
  - `GET /api/v1/approvals/pending` — 我的待审批（含 instance 摘要）
  - `GET /api/v1/approvals/:id` — 审批详情（完整表单只读 + 审批链状态）
  - `POST /api/v1/approvals/:id/approve` — 同意（Headers: Idempotency-Key + Body: instanceVersion）。事务：UPDATE ApprovalRecord + 推进 Instance（version 校验）→ 若下一个节点存在 → 流转到 in_approval；若最后节点 → Instance 完成。返回 200 或 409（版本冲突 / 已处理 / 已撤回）
  - `POST /api/v1/approvals/:id/reject` — 拒绝（同上幂等+乐观锁）。必填 comment。事务：UPDATE ApprovalRecord + Instance → rejected。流程终止
  - `POST /api/v1/approvals/:id/return` — 退回（同上幂等+乐观锁）。必填 comment。事务：Instance → returned。重新提交时审批链从头开始
  - `POST /api/v1/approvals/:id/transfer` — 转交（同上幂等+乐观锁）。事务：UPDATE ApprovalRecord.approver_id → targetUserId + 记录 transferred_from
- [x] **审批 UI**：
  - ApprovalPendingList（待审批列表）
  - ApprovalPage（左右布局：表单只读 FormEngine + 审批链时间线 + 审批操作区）
  - 审批操作区：CommentInput + ButtonGroup（同意/拒绝/退回/转交）+ 确认对话框
  - 退回和拒绝时：comment 必填，空则阻止操作
  - 退回后提交人的重新提交：从 MySubmissions 进入 → 修改 → 重新提交 → 审批链从头触发
- [x] 乐观锁冲突 UI：409 → 显示明确提示（"该提交已被撤回"/"该审批已被处理"）→ 自动刷新页面
- [x] 集成测试：同意推进到下节点；拒绝终止；退回 → 重新提交后从头审批；转交 → 新审批人可操作；幂等键重复请求 → 返回缓存结果 200；version 冲突 → 409；撤回 vs 审批竞态 → 后操作方 409

## 实现说明 / 与 Spec 的偏差（code-review 后确认）

- **成功状态码 200 而非 201**：四个动作统一 `res.json(...)`（200）。审批动作是「记录已存在、更新其状态」，非新建资源；四个动作保持一致优于单独让 approve 返回 201。
- **「已处理」为 409 而非 400**：spec 里 approve 写「400（已处理）」、撤回竞态写「后操作方 409」。实现统一为 `APPROVAL_NOT_PENDING → 409`（冲突语义），`docs/spec-implementation-form-engine.md` 错误码表已同步。
- **新增 `GET /api/v1/approvals/options`**（转交目标选择器）：`/approvers/options` 是 designer-gated，审批人用不了；新端点 gate 在 `approval:transfer`，列出持有 `approval:approve` 的活跃用户并排除调用者。
- **return/transfer 在第一节点（status `submitted`）可用**：UI 对每个 pending 节点都渲染退回/转交按钮，但状态机旧表只在 `in_approval` 定义这两条边 → 第一审批人永远 409。已给状态机补 `submitted --return→ returned`、`submitted --transfer→ submitted`（`shared/src/approvalStateMachine.ts`），并同步 `docs/design-spec-form-engine.md §6.3` 图。
- **撤回 vs 审批竞态 → 409（两条路径都覆盖）**：审批后撤回 → 撤回方 409 `APPROVAL_NOT_PENDING`（原 400，改为 409）；撤回后审批 → 审批方 409 `INSTANCE_WITHDRAWN`（新增错误码，文案「该提交已被撤回，无法审批」）。为此撤回**不再删除 pending 记录**——记录保留使陈旧审批动作能解析到记录并命中 draft 守卫（`loadActionContext`），而不是 404；`toInstanceDetail` 对草稿隐藏记录（`submitted_at` 为 null），提交链时间线照旧渲染活模板；重提时 submit 全量清空记录，链仍从头开始。
- **通知补齐（ADR-0001）**：submit 已通知审批人；本工单补上四个动作的 post-commit 通知（`server/src/services/notifications.ts` 泛化 `notifyUsers`）：advance → 下一位审批人 `instance_submitted`；最终同意 → 提交人 `instance_approved`；拒绝 → `instance_rejected`；退回 → `instance_returned`；转交 → 新审批人 `instance_transferred`。通知表 CHECK 约束里本就预留了这些类型。
- **幂等回放（ADR-0002）**：重复 Idempotency-Key 返回缓存 marker 后重建响应（200），不会二次推进；回放会重发通知（网络重试场景，MVP 接受）。

## 测试

- `shared/test/approvalStateMachine.test.ts`：新增 `submitted --return/transfer` 合法转移 + `getAllowedActions("submitted")` 更新。
- `server/src/routes/approvals.test.ts`：+node-1 退回、+node-1 转交、+撤回 vs 审批竞态两条、+5 条通知断言（含异步写入轮询）。
- `server/src/routes/instances.test.ts`：撤回用例更新为「记录保留但详情隐藏」。
- `client/src/pages/approver/ApprovalPage.test.tsx` / `ApprovalPendingList.test.tsx` / `FormFillPage.test.tsx` / `MySubmissions.test.tsx`：审批 UI + returned 重提。
