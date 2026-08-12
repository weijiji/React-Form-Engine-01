# 11 — 数据管理 + Excel 导出

**What to build:** 被授权用户可按表单类型查看所有已提交数据 → 按时间/状态筛选 → 查看单条详情（完整表单 + 审批历史）→ 导出为 Excel。按表单类型统计提交量。

**Blocked by:** 05 — 表单提交 + 草稿 + 填写器

**Status:** ready-for-agent

- [ ] **数据管理 API**：
  - `GET /api/v1/data` — 数据列表（?templateId=&status=&submittedBy=&dateFrom=&dateTo=&page=&pageSize=）。权限：`data:view`；数据隔离：仅返回权限范围内的数据
  - `GET /api/v1/data/:instanceId` — 数据详情（含 field_values + template_snapshot + approval_records）
  - `GET /api/v1/data/export` — 导出 Excel（同筛选参数）。速率限制：5 次/小时/用户。≤1000 条同步返回；>1000 条拒绝（提示缩小筛选范围）。导出操作生成审计日志（谁 + 何时 + 筛选条件）
  - `GET /api/v1/stats` — 统计（?dateFrom=&dateTo= → byTemplate: [{ templateId, templateName, count }]）
- [ ] **数据管理 UI**：
  - DataListPage：模板选择器 + 时间/状态筛选 + 分页列表（提交人、时间、状态）
  - DataDetailPage：表单内容只读渲染 + 审批时间线
  - StatsPage：按模板类型的提交量计数（MVP 简单柱状图或表格）
  - 导出按钮：点击 → 下载 Excel 文件；触发速率限制 → 429 提示
- [ ] 集成测试：数据权限隔离（用户 A 看不到用户 B 的提交）；导出文件内容正确；统计计数正确；速率限制超限 → 429
