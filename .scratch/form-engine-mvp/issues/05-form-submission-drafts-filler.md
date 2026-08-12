# 05 — 表单提交 + 草稿 + 填写器

**What to build:** 填写者浏览已发布表单列表 → 打开表单 → 填写（实时验证+可见性联动+自动保存草稿）→ 提交（原子事务：Instance + Snapshot + ApprovalRecord）→ 查看审批进度。草稿恢复时检测模板版本差异并保留孤儿数据。

**Blocked by:** 04 — 模板 API + 表单设计器

**Status:** ready-for-agent

- [ ] **表单实例 API**：
  - `GET /api/v1/forms` — 可用表单列表（仅 published 模板，?category=&search=）
  - `POST /api/v1/instances` — 创建实例（status: draft, field_values: {}）
  - `GET /api/v1/instances/:id` — 获取实例（含 template_snapshot）
  - `PUT /api/v1/instances/:id/values` — 保存字段值（自动保存用）
  - `POST /api/v1/instances/:id/submit` — 提交：检查 `template.status === 'published'` → 全量验证 → **数据库事务**（INSERT Instance + INSERT template_snapshot + INSERT ApprovalRecord）→ 事务后异步 Notification + SSE push。审批人解析失败 → 事务回滚 → 500
  - `POST /api/v1/instances/:id/withdraw` — 撤回（需 instanceVersion → 乐观锁、审批人未处理校验）→ 409 或 status → draft
  - `GET /api/v1/instances/my` — 我的提交（?status=&page=&pageSize=）
- [ ] **草稿 API**：
  - `GET /api/v1/drafts` — 我的草稿列表
  - `GET /api/v1/drafts/:id` — 获取草稿（返回时检查模板 version 差异）
  - `DELETE /api/v1/drafts/:id` — 删除草稿
- [ ] **草稿自动保存**（前端）：onBlur 触发（dirty 检测）+ 30s 定时兜底 → 无变更不请求 → 界面右上角"草稿已保存 X 秒前"
- [ ] **草稿-模板版本不匹配**（后端 + 前端）：打开草稿时比较 `draft.updatedAt` 与 `FormTemplate.updatedAt` → 基于 fieldId 尽力映射 → 不匹配的值移入 `_orphaned` → 前端黄色提示条 + 折叠区域展示孤儿数据
- [ ] **填写器 UI**：
  - FormCenter（可用表单列表，搜索 + 分类筛选）
  - FormFillPage（左右布局：FormEngine 渲染 + 审批链侧栏，提交/保存草稿按钮）
  - MyDrafts（草稿列表 → 恢复填写）
  - MySubmissions（提交列表 + 审批追踪）
  - 移动端 (< 768px)：上下布局，单列
- [ ] 集成测试：提交原子性（Instance + Snapshot + ApprovalRecord 全有或全无）；模板下线后提交 → 400；草稿自动保存 → 恢复 → 字段值一致；草稿版本不匹配 → _orphaned 正确生成
