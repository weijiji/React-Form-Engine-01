# BUG-07 — 设计器「未签出」时仍可编辑：组件面板可拖拽到画布，编辑器无只读保护

**Status:** open
**记录日期:** 2026-08-19
**类型:** 编辑权限守卫缺失 / 功能 BUG

## 现象

当模板处于**未签出**状态（当前用户无编辑权限，含他人锁定 / 已归档）时，
设计器仍完全可编辑：可以从「组件面板」拖动组件到画布、点击添加字段，
并执行移动 / 删除 / 属性修改等 schema 变更操作。

## 复现步骤

1. 设计者打开一个**未签出**的模板（或他人已锁定 / 已归档的模板）的设计器
2. 观察状态徽章：显示「未签出」/「已锁定 · 他人」/「已归档 · 只读」
3. 从左侧组件面板拖拽一个字段到画布（或点击添加）→ **成功添加**
4. 继续尝试移动 / 删除字段、修改属性 → 均可用
5. 改动仅在本地（`dirty`），「保存」按钮被 disabled —— 用户可随意改动但无法保存

## 期望行为

- 未签出 / 他人锁定 / 已归档时，设计器进入**只读模式**：
  - 组件面板禁用（不可拖拽、不可点击添加）
  - 画布禁用拖放
  - 属性面板只读
- 或提供明确的「只读预览」提示，避免用户误以为可编辑

## 实际行为

- 编辑器本体无任何只读 / 禁用保护；`isHolder` 仅用于状态徽章显示、
  「签出并编辑」按钮显隐、保存/发布按钮 `disabled`
- 组件面板 / 画布 / 属性面板均无条件可交互

## 涉及范围

- 前端：`client/src/pages/designer/DesignerPage.tsx`
  （`handleAddField` / `handleAddSection` / `handleMoveField` /
  `handleRemoveField` / `handleChangeField` 等均无 `isHolder` 守卫；
  `ComponentPalette` / `DesignCanvas` / `PropertyPanel` 未接收只读参数）
- 前端：`client/src/designer/ComponentPalette.tsx`（无 `disabled` 支持，
  item 始终 `draggable` + 点击触发 `onAddField`）
- 前端：`client/src/designer/DesignCanvas.tsx` / `client/src/designer/PropertyPanel.tsx`

## 根因分析

编辑权限只通过「保存 / 发布按钮 disabled」间接表达，没有把 `isHolder`
（持锁）下传到编辑器三大区域做**只读模式**控制；schema 变更处理函数
也未统一加 `isHolder` 守卫。导致"无编辑权限却可编辑"的假象，
改动滞留本地且无法保存，存在误操作与数据丢失风险。

## 严重程度 / 优先级

中-高（编辑权限守卫缺失：未签出可编辑与「独占签出锁」协作模型相悖；
用户可能误操作后因无法保存而丢改动，或误以为锁已持有）

## 建议修复方向（参考）

- 方案 A：抽 `readonly = !isHolder`（或 `!canEdit`）布尔，下传给
  `ComponentPalette` / `DesignCanvas` / `PropertyPanel`，三处按只读渲染
- 方案 B：在 schema 变更处理函数（`handleAddField` 等）入口统一加
  `if (!isHolder) return;` 兜底
- 已归档模板还应整体只读（连签出也不允许）
- 补充：`PropertyPanel` 的字段/章节属性输入、审批链编辑同步只读
- 测试：未签出态下拖拽/点击添加被禁用；`npm run typecheck`

## 关联工单

- `issues/04-template-api-form-designer.md`（设计器）
- `BUG-05`（同区域状态徽章配色，均为「未签出/锁定状态表达」问题）
- `issues/20-template-delete-button.md`（锁模型既有实现）
