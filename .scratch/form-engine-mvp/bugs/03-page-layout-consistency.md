# BUG-03 — 页面布局缺乏统一：仅「创建模板」居中符合原型，其余内容页均居左

**Status:** open
**记录日期:** 2026-08-19
**类型:** UI 建议 / 设计一致性
**需 UI/UX 设计师介入:** ✅ 是 —— 期望 UI/UX 大整顿（全站布局一致性专项）

## 现象

系统各业务页面内容容器对齐不统一，且大多脱离原型设计的布局规范：
仅「创建模板」界面符合原型，其余页面均居左、宽度不受统一约束。

| 页面 | 容器类 | 实际样式 | 对齐 | 符合原型 |
| --- | --- | --- | --- | --- |
| 创建模板（`CreateTemplatePage`） | `.create` | `max-width: 980px; margin: 0 auto` | 居中 | ✅ |
| 用户管理 / 角色管理（`UsersPage` / `RolesPage`） | `.rbac` | `max-width: 980px`（缺 `margin: 0 auto`） | 居左 | ❌ |
| 我的模板（`TemplatesPage`） | `.templates` | 无 max-width / margin 约束 | 居左 | ❌ |
| 表单中心（`FormCenter`） | `.filler` | `display: flex; flex-direction: column`（无宽度约束） | 居左 | ❌ |

## 复现步骤

1. 以管理员登录，依次访问 `创建模板`（`/designer/create`）、`用户管理`（`/admin/users`）、`角色管理`（`/admin/roles`）
2. 以填写者访问 `我的模板`、`表单中心`（`/filler/forms`）
3. 对比各页面内容容器：只有「创建模板」在宽屏下居中，其余均贴左、且宽屏下宽度表现不一

## 期望行为

- 所有内容页遵循原型统一布局规范：原型 `prototype/assets/app.css` 中的
  `.page-narrow { max-width: 980px; margin: 0 auto; width: 100% }`
- 建议抽一个共享页面容器（组件 / CSS 类），各页统一引用，保证对齐与宽度一致

## 实际行为

- 仅 `.create` 居中符合原型；`.rbac`、`.templates`、`.filler` 均居左，
  且 `.templates` / `.filler` 无 max-width 约束（宽屏下撑满或表现不一）

## 涉及范围

- 前端：`client/src/pages/admin/admin.css`（`.rbac`）、
  `client/src/pages/designer/templates.css`（`.templates` / `.create`）、
  `client/src/pages/filler/filler.css`（`.filler`）
- 原型基准：`prototype/assets/app.css`（`.page-narrow` / `.canvas-inner`）
- 关联设计系统：ADR-0008（design system）、ADR-0011（共享控件组件化精神）

## 根因分析

各页面由不同工单（05 表单中心、09 用户/角色管理、03 模板页等）分别实现，
页面容器各自为政：有的加了 `max-width` 但漏了 `margin: 0 auto`（`.rbac`），
有的完全没有宽度约束（`.templates` / `.filler`）。原型虽有 `.page-narrow`
统一规范，但实现层未统一落地，缺少一个共享的页面布局容器。

## 严重程度 / 优先级

低（纯视觉一致性，不影响功能与数据；但影响产品整体观感统一，
与「Canvas Workbench」设计系统目标相悖，建议随设计系统优化一并处理）

## 整顿范围（UI/UX 大整顿）

> 非单点修复 —— 期望由 UI/UX 设计师主导一次**全站布局一致性大整顿**：

1. **全站盘点**：逐一走查所有页面（设计器 / 填写者 / 审批者 / 管理员 / 运维
   各门户），列出每个页面容器类（`.rbac` / `.templates` / `.filler` /
   `.create` 等）的现状与偏离原型的差异清单
2. **统一布局规范**：以原型 `.page-narrow`（`max-width: 980px; margin: 0 auto`）
   为基准，设计师定稿统一的内容区宽度、对齐、留白（间距体系）规范
3. **共享容器落地**：新增共享页面容器组件/样式（如 `Page.tsx` 或全局
   `.page-narrow` 类），各页统一引用，消除各自为政
4. **逐页迁移**：按盘点清单逐页套用统一容器，处理特殊页（如设计器画布
   全屏工作台、空状态页）的例外规则
5. **回归验证**：宽屏/窄屏（响应式 `@media`）下各页对齐一致；
   `npm run check:css` + `npm run typecheck` + UI 测试

## 建议修复方向（参考）

- 方案 A：新增共享页面容器（如 `client/src/layouts/Page.tsx` 组件或全局
  `.page-narrow` 类），内容页统一套用，容器居中（`max-width: 980px; margin: 0 auto`）
- 方案 B：直接给 `.rbac` / `.templates` / `.filler` 补齐
  `max-width: 980px; margin: 0 auto; width: 100%`
- 修复后核对：宽屏下各内容页对齐一致；`npm run check:css` + `npm run typecheck`

## 关联工单

- `issues/03-form-renderer-field-components.md`（模板相关页面）
- `issues/05-form-submission-drafts-filler.md`（表单中心）
- `issues/09-auth-rbac-permissions.md`（用户/角色管理）
- `docs/design-system-form-engine.md`（设计系统规范，ADR-0008）
