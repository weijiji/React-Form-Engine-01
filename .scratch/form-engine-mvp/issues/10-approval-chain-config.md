# 10 — 审批链配置

**What to build:** 设计器中为表单模板配置多级审批链——添加审批节点、配置审批人规则（组织结构/角色/指定人员）、拖拽排序。审批链嵌入模板 Schema 一同存储。

**Blocked by:** 04 — 模板 API + 表单设计器

**Status:** done (verified against code 2026-08-22; reorder via ↑/↓ buttons, not drag — see note)

- [X] **审批链配置 UI**（设计器右侧面板"审批链" Tab）：
  - 审批节点列表（可拖拽排序），每节点：序号 + 标签 + 审批人规则类型选择器 + 规则参数 + 删除按钮
  - 规则类型：
    - "直属上级"（org_structure）→ 无需额外参数，提交时通过 OrgDataSource 解析
    - "指定角色"（role）→ 角色下拉选择器
    - "指定人员"（specific）→ UserPicker 选择
  - `[+ 添加审批节点]` 按钮追加新节点
  - 审批链为空时允许保存，标记"提交后将直接完成"
- [X] **审批链数据格式**（存储到 approval_chain JSONB）：
  ```json
  {
    "nodes": [
      { "id": "node-001", "order": 1, "label": "直属上级", "approverRule": { "type": "org_structure", "relation": "direct_manager" } },
      { "id": "node-002", "order": 2, "label": "IT 审批", "approverRule": { "type": "role", "roleId": "role-it" } }
    ]
  }
  ```
- [X] **审批人解析**：提交时 ApprovalResolver（T2）按节点顺序逐一解析 → 解析失败（直属上级不存在/角色空）→ 事务回滚，提交失败"审批流程配置异常"
- [X] 集成测试：空审批链 → 提交后直接完成；多节点审批链 → 按序解析；解析失败 → 提交失败 + 错误信息
