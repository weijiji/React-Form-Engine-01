# 12 — 模板导出/导入

**What to build:** 设计者将模板配置（Schema + 审批链）导出为 JSON 文件 → 下载 → 在另一环境导入 → 创建完整副本。导入时进行版本兼容校验。

**Blocked by:** 04 — 模板 API + 表单设计器

**Status:** ready-for-agent

- [ ] **导出 API**：
  - `POST /api/v1/templates/:id/export` — 导出。权限：`template:export`。响应：JSON 文件下载（MIME: application/json）。Body：`{ name, schemaVersion, schema, approvalChain, exportedAt, exportedBy }`。导出时校验模板已签入（未签入 → 400 提示）
- [ ] **导入 API**：
  - `POST /api/v1/templates/import` — 导入。权限：`template:import`。multipart/form-data 上传 JSON 文件
  - 版本兼容校验：`import.major === system.major` → 允许；不匹配 → 400 明确提示（"版本过高，请升级系统"/"版本过旧，请使用迁移工具"）
  - Schema 结构合法性校验：字段类型可识别、审批链完整、子表单深度 ≤ 2
  - 成功：创建新模板（status: draft，名称后加 "(导入)" 后缀避免冲突）
- [ ] **设计器 UI**：
  - 模板详情页：导出按钮 → 下载文件
  - 模板列表页 / 独立页面：导入按钮 → 文件选择器 → 上传 → 导入成功跳转到新模板
- [ ] 集成测试：导出 → 导入 → 新模板 Schema 与审批链一致；跨主版本导入 → 400；非法 JSON 导入 → 400
