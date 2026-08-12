# 08 — 条件编辑器 MVP

**What to build:** 设计器中为每个字段配置单层 AND 显示条件——选择依赖字段 → 运算符 → 比较值，所有条件之间为 AND 关系。字段在预览和填写时根据条件动态显示/隐藏。

**Blocked by:** 04 — 模板 API + 表单设计器

**Status:** ready-for-agent

- [ ] **条件编辑器 UI**：
  - 属性面板中每个字段的"显示条件"触发按钮 → 打开条件编辑器面板
  - 平铺的条件行列表，每行：依赖字段选择器（下拉，含所有字段）→ 运算符选择器（10 种）→ 比较值输入（根据字段类型切换：文本/数字/日期/下拉）→ 删除按钮
  - `[+ 添加条件]` 按钮追加新行
  - 所有条件间隐式 AND（不显示 AND/OR 切换按钮——Phase 2 再加）
  - 条件编辑器关闭时，预览面板立即反映新的可见性规则
- [ ] **条件数据格式**（存储到 Schema JSONB）：
  ```json
  "visibilityCondition": {
    "conditions": [
      { "fieldId": "fld-type", "operator": "equals", "value": "rd" },
      { "fieldId": "fld-classified", "operator": "equals", "value": true }
    ]
  }
  ```
  数据格式预留升级路径——Phase 2 可包装为 `{ type: "and", conditions: [...] }`
- [ ] **条件求值**：ConditionEvaluator（T2）消费该格式，在 FormRenderer 渲染前过滤字段/章节
- [ ] 边界用例：依赖字段不存在/已删除 → 条件始终为 false（字段隐藏）；条件引用自身字段 → SchemaParser 校验时警告；条件间的逻辑冲突不自动检测（设计者自行验证）
