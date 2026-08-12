# 06 — 审批引擎 + 审批操作 UI

**What to build:** 审批人查看待审批列表 → 打开审批详情（表单只读 + 审批链时间线）→ 执行同意/拒绝/退回/转交 → 流程自动流转或终止。每个审批操作强制幂等键 + 乐观锁。

**Blocked by:** 05 — 表单提交 + 草稿 + 填写器

**Status:** ready-for-agent

- [ ] **审批 API**：
  - `GET /api/v1/approvals/pending` — 我的待审批（含 instance 摘要）
  - `GET /api/v1/approvals/:id` — 审批详情（完整表单只读 + 审批链状态）
  - `POST /api/v1/approvals/:id/approve` — 同意（Headers: Idempotency-Key + Body: instanceVersion）。事务：UPDATE ApprovalRecord + 推进 Instance（version 校验）→ 若下一个节点存在 → INSERT 新 ApprovalRecord；若最后节点 → Instance 完成。返回 201 或 409（版本冲突）或 400（已处理）
  - `POST /api/v1/approvals/:id/reject` — 拒绝（同上幂等+乐观锁）。必填 comment。事务：UPDATE ApprovalRecord + Instance → rejected。流程终止
  - `POST /api/v1/approvals/:id/return` — 退回（同上幂等+乐观锁）。必填 comment。事务：Instance → returned。重新提交时审批链从头开始
  - `POST /api/v1/approvals/:id/transfer` — 转交（同上幂等+乐观锁）。事务：UPDATE ApprovalRecord.approver_id → targetUserId + 记录 transferred_from
- [ ] **审批 UI**：
  - ApprovalPendingList（待审批列表）
  - ApprovalPage（左右布局：表单只读 FormEngine + 审批链时间线 + 审批操作区）
  - 审批操作区：CommentInput + ButtonGroup（同意/拒绝/退回/转交）+ 确认对话框
  - 退回和拒绝时：comment 必填，空则阻止操作
  - 退回后提交人的重新提交：从 MySubmissions 进入 → 修改 → 重新提交 → 审批链从头触发
- [ ] 乐观锁冲突 UI：409 → 显示明确提示（"该提交已被撤回"/"该审批已被处理"）→ 自动刷新页面
- [ ] 集成测试：同意推进到下节点；拒绝终止；退回 → 重新提交后从头审批；转交 → 新审批人可操作；幂等键重复请求 → 返回缓存结果 200；version 冲突 → 409；撤回 vs 审批竞态 → 后操作方 409
