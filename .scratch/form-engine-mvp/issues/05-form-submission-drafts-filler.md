# 05 — 表单提交 + 草稿 + 填写器

**What to build:** 填写者浏览已发布表单列表 → 打开表单 → 填写（实时验证+可见性联动+自动保存草稿）→ 提交（原子事务：Instance + Snapshot + ApprovalRecord）→ 查看审批进度。**草稿即草稿状态的 FormInstance（实例即草稿，ADR-0014）**；草稿打开时检测模板版本差异并保留孤儿数据。

**Blocked by:** 04 — 模板 API + 表单设计器

**Status:** 已实现（d6a4337）→ 按 ADR-0014 重构草稿模型（删除独立 Draft 实体，草稿并入草稿状态实例）

> 说明：本工单已实现过一轮（d6a4337），原清单同时存在「草稿状态实例」与「独立 Draft 实体」两个草稿概念。领域建模评审后决定合并为单一模型（ADR-0014）。以下清单为**合并后的目标状态**：✅ 为已实现且保持不变；其余为新模型下的增量改动。

- [x] **表单实例 API**（已实现；按新模型微调）：
  - `GET /api/v1/forms` — 可用表单列表（仅 published 模板，?category=&search=）✅
  - `POST /api/v1/instances` — 创建实例（status: draft，草稿即实例）✅
  - `GET /api/v1/instances/:id` — 获取实例（含 template_snapshot）✅；⚠️ **加属主校验**（403，仅本人）；草稿状态实例返回前执行**幂等 fieldId 迁移**，响应含 `_orphaned` + `version_mismatch`
  - `PUT /api/v1/instances/:id/values` — 保存字段值（自动保存）✅；孤儿保留在 `field_values._orphaned`；过期草稿 → 410
  - `POST /api/v1/instances/:id/submit` — 提交：检查 `template.status === 'published'` → 全量验证（`_orphaned` 不参与）→ **数据库事务**（UPDATE Instance status+快照+version + INSERT ApprovalRecord）→ 事务后异步 Notification + SSE push。审批人解析失败 → 事务回滚 → 500。无审批链 → 直接 `approved`。过期草稿 → 410
  - `POST /api/v1/instances/:id/withdraw` — 撤回（需 instanceVersion → 乐观锁、审批人未处理校验）→ 409 或 status → draft ✅
  - `GET /api/v1/instances/my` — 我的表单（?status=&page=&pageSize=）✅；过滤过期草稿
- [x] **删除独立 Draft 实体**（ADR-0014）：
  - 删 `drafts` 表（含未生效的 `expires_at` 列）+ migration
  - 删 `/api/v1/drafts` 路由（`app.ts` 挂载、`openapi.yaml` 路径与 `drafts` tag），重新生成 `shared/src/api.ts`
  - 删 `MyDrafts` 页 + `/filler/drafts` 路由/导航/`ROUTE_CODES` + 填单页「保存草稿」按钮与「已保存到我的草稿」提示（`DraftIcon` 保留——设计区 `/designer/drafts`「草稿模板」导航仍在使用，属工单 04 功能）
  - 删 drafts 路由测试
- [x] **草稿保留策略**（BR-15，ADR-0014）：
  - 仅 `status='draft'` 参与；谓词 `updated_at < now() - interval '2 years'`（不新增列）
  - `GET /instances/my` 过滤过期；`GET /:id`、`PUT /values`、`POST /submit` 对过期草稿返回 **410「草稿已过期，无法继续」**
  - 服务器启动时注册 12h `setInterval` 批量 DELETE 过期草稿；已提交实例永久保留
- [x] **草稿自动保存**（前端，已实现）：1s 防抖 onChange（优于原稿 onBlur——捕获每次编辑）+ 30s 定时兜底 + dirty 检测 → 无变更不请求 → 界面右上角"草稿已保存 X 秒前"；提交前 flush 未决保存 ✅
- [x] **草稿-模板版本不匹配**（迁移逻辑已实现于 Draft 实体，**迁至草稿状态实例**）：
  - `migrateFieldValues` 幂等迁移（fieldId 匹配保留 / 不匹配入 `_orphaned` / 新增字段留空 / 合并既有孤儿）
  - `_orphaned` 保留在实例 `field_values` 内随自动保存持久化（PUT /values 须带上）
  - 黄条 + 折叠孤儿区从 `MyDrafts` 迁至 `FormFillPage`（草稿状态实例打开时展示）
- [x] **填写器 UI**：
  - FormCenter（可用表单列表，搜索 + 分类筛选）✅ 已实现
  - FormFillPage（左右布局：FormEngine 渲染 + 审批链侧栏，提交按钮）✅ 已实现；孤儿 banner 迁入
  - 「我的提交」→ 改名 **「我的表单」**：列出全部状态实例，**状态筛选 UI 重做**（现为简单 select），行点击打开**预览弹窗**（复用填单页只读渲染）
  - 「我的草稿」入口删除
  - 移动端 (< 768px)：上下布局，单列 ✅ 已实现
- [x] 集成测试（调整/增补）：
  - 提交原子性（Instance + Snapshot + ApprovalRecord 全有或全无）✅ 已有
  - 模板下线后提交 → 400 ✅ 已有
  - 草稿自动保存 → 恢复 → 字段值一致 ✅ 已有
  - 版本不匹配 → `_orphaned` 正确生成 + 随自动保存持久化（改落实例，原 drafts 测试迁移）
  - **新增**：过期草稿 410（GET/PUT/submit）、`GET /instances/:id` 非属主 403、无审批链提交 → `approved`
