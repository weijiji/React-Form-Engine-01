# 04 — 模板 API + 表单设计器

**What to build:** 设计者从模板列表创建新模板 → 进入三栏设计器（组件面板 + 画布 + 属性面板/预览）→ 拖拽字段到画布 → 配置属性 → 实时预览 → 签入保存 → 发布。模板可直接发布（无审批流程）。

**Blocked by:** 01 — 项目脚手架 + 数据库, 03 — 表单渲染器 + 基础字段组件

**Status:** ready-for-agent

- [X] **模板 API**（全部 `/api/v1/` 前缀）：
  - `POST /api/v1/templates` — 创建模板（自动签出给创建者）
  - `GET /api/v1/templates` — 列表（?category=&status=&search=&page=&pageSize=）
  - `GET /api/v1/templates/:id` — 详情（含 schema + approval_chain）
  - `PUT /api/v1/templates/:id/schema` — 保存 Schema（校验签出锁持有者）
  - `POST /api/v1/templates/:id/checkout` — 签出（已锁 → 409）
  - `POST /api/v1/templates/:id/checkin` — 签入（释放锁）
  - `POST /api/v1/templates/:id/publish` — 发布（draft → published，原子：UPDATE status + 清缓存）
  - `POST /api/v1/templates/:id/force-unlock` — 强制解锁（管理员）
  - `DELETE /api/v1/templates/:id` — 删除草稿模板（仅 status=draft，已发布/归档不可删；template:delete）
- [X] **设计器 UI**：
  - 三栏 flex 布局：左侧 ComponentPalette（240px）+ 中间 DesignCanvas（flex:1，内嵌DesignerCanvasInner，1，内嵌DesignerCanvasInner maxwidth=960px）+ 右侧面板（360px，属性/审批链/预览三个 Tab）
  - 拖拽支持：Palette → Canvas（HTML5 DnD），Canvas 内字段自由排序（鼠标长按拖拽移动）
  - 属性面板：按 fieldType 动态渲染配置表单（基本属性 + 验证规则 + 选项编辑器）
  - 预览面板：嵌只读 FormEngine，Schema 变更时 < 1s 同步渲染
  - 签出状态徽标（"编辑中"/"已锁定 - 张三"）
- 最终效果必须与`/prototype/designer-edit.html`完美对齐，注意不需要 shell>sidebar + shell>main>topbar 
- [X] 集成测试：创建模板 → 签出 → 编辑 → 签入 → 发布全流程；他人签出已锁模板 → 409；强制解锁；删除草稿模板 → 204 后 404；删除已发布模板 → 400 TEMPLATE_NOT_DRAFT
