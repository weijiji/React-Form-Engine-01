# 13 — 安全加固 + 设计打磨

**What to build:** 全系统安全措施收尾 + 用户体验打磨。速率限制、文件消毒、移动端响应式、浏览器关闭提示。

**Blocked by:** 09 — 认证 + RBAC 权限

**Status:** ready-for-agent

- [ ] **速率限制中间件**：Express 中间件 + 内存计数器。登录 5/min/IP、文件上传 20/min/用户、提交 10/min/用户、导出 5/hour/用户。超限 → 429 + Retry-After Header
- [ ] **文件上传路径穿越防护**：
  - FileService 文件名消毒：丢弃原始路径 → 仅保留 basename → 前加 UUID 前缀
  - 存储路径格式：`{upload_root}/{yyyy}/{mm}/{uuid}_{sanitized_basename}`
  - 写入前验证：resolve 为绝对路径 → 必须在 `upload_root` 目录内 → 否则拒绝
- [ ] **CORS 显式配置**：允许的来源域名白名单（非 `*`），从环境变量读取
- [ ] **移动端响应式打磨**：
  - 填写页：< 768px 时表单在上、审批链在下，单列布局
  - 设计器：< 1024px 时提示"请在桌面端使用设计器"（MVP 设计器不强制移动端适配）
  - 子表单区域：横向滚动（overflow-x: auto）
- [ ] **浏览器关闭 dirty-check**：`window.beforeunload` — 设计器有未保存变更或填写器有未保存草稿时，提示"有未保存的更改，确定离开吗？"
- [ ] **设计器细项**：
  - 画布至少 1 个可填写字段方可签入（警告）
  - 字段标签唯一性：同一模板内重复标签 → 警告（黄色高亮），不阻断
  - 画布字段数达到 200 上限 → 提示"已达到最大字段数限制"
- [ ] **统一错误响应格式**：所有 API 错误统一 `{ error: { code, message, details? } }`，9 个错误码全部可用
- [ ] 跨浏览器最低验证：Chrome、Edge、Safari、Mobile Safari、Mobile Chrome 上核心填写流程可用
