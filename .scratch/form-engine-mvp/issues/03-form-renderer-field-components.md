# 03 — 表单渲染器 + 基础字段组件

**What to build:** 浏览器端传入 Schema JSON → 渲染出一个完整可填写的表单，包含实时验证反馈和可见性联动。所有基础字段类型可用。

**Blocked by:** 02 — 表单引擎核心

**Status:** done

- [x] **ComponentRegistry + ComponentFactory**：`fieldType → Component` 映射表 + 工厂函数。按 FieldComponentProps 契约注入 props：id、label、value、onChange、onBlur、error、disabled、placeholder、options、validation、schema。
- [x] **全部 13 种基础字段组件**，每种按 FieldComponentProps 契约实现：
  - TextInput、TextArea、NumberInput
  - Select、RadioGroup、CheckboxGroup
  - DatePicker、DateTimePicker
  - FileUpload（前端 MIME 校验 + 大小拦截 + 文件列表管理）
  - SubForm（增删行 + 递归渲染，最多 2 层嵌套）
  - UserPicker（通过 OrgDataSource 搜索用户，单选/多选）
  - Section（章节容器，含折叠/展开）
  - InfoText（info/warning/danger 三种样式 + visibilityCondition）
- [x] **FormRenderer**：递归遍历 sections 树 → 按可见性过滤 → ComponentFactory 渲染。子表单递归（深度 ≤ 2）。
- [x] **表单级交互**：字段 onBlur → 即时验证反馈（红色边框 + 错误信息）；字段 onChange → 联动重算可见性 + 子字段级联隐藏；提交按钮 disabled 状态（submitting + 所有验证通过前不启用）；触发表单级校验时滚动到第一个错误字段。
- [x] 前端单元测试：每种字段组件独立渲染测试；字段 onBlur 验证反馈；可见性联动场景（单字段 → 章节 → 子字段级联）；移动端宽度（375px）渲染不溢出。
