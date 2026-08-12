# 07 — 通知系统（SSE + 通知中心）

**What to build:** 关键业务事件（提交、审批同意/拒绝/退回/转交、撤回、完成）触发后：通知持久化落库 + 在线用户收到实时 SSE 推送。通知中心可查看未读/已读/全部。架构预留渠道适配器接口。

**Blocked by:** 05 — 表单提交 + 草稿 + 填写器, 06 — 审批引擎 + 审批操作 UI

**Status:** ready-for-agent

- [ ] **通知服务核心**：
  - 事件监听器：InstanceService 和 ApprovalService emit 事件 → NotificationService 消费
  - 事件-通知映射：7 种事件（instance.submitted/approved/rejected/returned/transferred/withdrawn/completed）→ 对应通知类型
  - 接收人确定：按映射表查找（提交人、审批人、被转交人等）
  - 渠道适配器接口：`ChannelAdapter { send(notification): Promise<void> }`
  - `InAppChannel`（MVP）：INSERT notification + SSE push
- [ ] **SSE 实现**：
  - `GET /api/v1/sse/instance/:id` — 订阅实例审批进度（text/event-stream）
  - 事件类型：`approval_update` → `{ nodeOrder, status, approverName, comment }`
  - 断线自动重连（Last-Event-ID），重连期间丢失事件依赖通知中心查询回补
  - 连接数监控（上限告警）
- [ ] **通知 API**：
  - `GET /api/v1/notifications` — 通知列表（?isRead=&page=&pageSize=，返回 unreadCount）
  - `PUT /api/v1/notifications/:id/read` — 标记已读
  - `PUT /api/v1/notifications/read-all` — 全部已读
- [ ] **通知 UI**：
  - NotificationCenter（通知列表 + 未读数角标 + 一键已读 + 点击跳转到关联页面）
  - 全局通知铃铛图标（Navbar 中，未读红点）
  - SSE 断连时显示"连接已断开"提示（30s 内自动重连）
- [ ] 集成测试：提交 → 审批人收到通知；审批通过 → 提交人收到通知；SSE 推送到达；通知已读标记正确
