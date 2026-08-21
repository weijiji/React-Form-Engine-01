# BUG-03 — 页面布局缺乏统一：仅「创建模板」居中符合原型，其余内容页均居左

**Status:** fixed（分支 `hotfix/03-page-layout-consistency`，待手动走查确认）
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

## 解决方案（UI/UX 定稿，2026-08-21，分支 `hotfix/03-page-layout-consistency`）

> 经 UI/UX Lead 走查定稿：**单一标准宽度 960px（12 栅格整数）**，宽度收敛到壳层，
> 各页不再自设容器宽度。原型 `.page-narrow` 与 DS 文档 980 → 960 同步更新。

### 决策记录（grilling 逐项确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 宽度体系 | 一律 **960px** 居中（推翻「分层多档」）；仅 Shell 外设计器工作台例外（不动） |
| 2 | 落位机制 | 宽度收敛到 Shell `.page`（默认 960 居中），异常显式退出 |
| 3 | 内部表单 | `.blank` 保留 640px 作为**表单内层度量**（页面 960 / 表单 640），避免输入框拉满 |
| 4 | 重复标题 | 用户/角色管理页重复 h2 **砍掉**（顶栏 h1 单一标题），纳入本专项 |
| 5 | 间距/响应式 | `.page` 默认 `padding:24px`，`@media ≤768px` 收 16px（复用现有断点） |
| 6 | 移动端导航 | **汉堡 + off-canvas 抽屉**：≤768px 侧栏移出视口，顶栏汉堡滑入覆盖层 + 遮罩；路由切换/点遮罩/点导航自动关闭（否决底部 tab：5 组权限导航塞不进 tab） |
| 7 | 回归验证 | check:css + typecheck + client vitest + 三宽度手动走查清单 |

### 改动清单

- `client/src/layouts/Shell.css`：`.page` 加 `max-width:960px; margin:0 auto; width:100%` + 768 断点
- `client/src/pages/designer/templates.css`：删 `.create` 宽度；`.blank` 改注为表单内层度量
- `client/src/pages/designer/nl.css`：删 `.nl` 宽度（聊天收 960，气泡 88% 封顶）
- `client/src/pages/admin/admin.css`：删 `.rbac` 宽度；`.rbac-toolbar` 改 `flex-end`；删死代码 `.rbac-title`
- `client/src/pages/admin/UsersPage.tsx` / `RolesPage.tsx`：删重复 `<h2>`
- `client/src/layouts/Shell.tsx`：加抽屉状态（`useState` + 路由切换自动关闭）+ 顶栏汉堡按钮 + 覆盖遮罩
- `client/src/layouts/icons.tsx`：新增 `MenuIcon`（汉堡）
- `client/src/layouts/Shell.css`：`.nav-toggle` / `.sidebar-backdrop` 桌面隐藏；`≤768px` 侧栏转 fixed off-canvas 抽屉（`translateX` 过渡 + 遮罩 `z-index` 分层）
- `client/src/layouts/Shell.test.tsx`：新增 2 用例（汉堡开/遮罩关、路由切换关）
- `docs/design-system-form-engine.md`：shell 图 `.page-narrow` 980 → 960 + 768 断点说明
- `prototype/assets/app.css`：`.page-narrow` 980 → 960（保持「原型即源」）
- 设计器工作台（`/designer/templates/:id`）：Shell 外，**未改动**

### 手动走查清单（回归基线）

三宽度 × 全部 Shell 路由，逐页核对：居中、960 上界、无贴边、标题不重复。

视口：`1440px` / `1024px` / `375px`

| 路由 | 页面 | 走查要点 |
|---|---|---|
| `（全站）` | Shell 移动端抽屉 | 375px 下：顶栏出现汉堡；点开 → 侧栏滑入覆盖 + 遮罩；点遮罩 / 导航项 / 路由变化 → 关闭；内容区不再被 236px 侧栏挤压 |
| `/designer/templates` | 我的模板 | 卡片网格居中，960 内铺开 |
| `/designer/create` | 创建模板 | 引导语 h2 保留，选项卡居中 |
| `/designer/create/nl` | 自然语言创建 | 聊天收 960，气泡不拉满 |
| `/designer/create/blank` | 空白模板 | 页面 960，表单卡 640 居中 |
| `/designer/drafts` | 草稿模板（占位） | 自动继承 960 |
| `/filler/forms` | 表单中心 | 卡片网格居中 |
| `/filler/instances/:id` | 填写表单 | 双栏：表单列 ~576px + 审批链 320px |
| `/filler/drafts` / `/filler/submissions` | 草稿 / 提交 | 表格居中 |
| `/approver/pending` / `/approver/history` | 审批（占位） | 自动继承 960 |
| `/admin/users` / `/admin/roles` | 用户 / 角色管理 | **无重复标题**；工具栏按钮右对齐 |
| `/admin/*`、`/ops/*` | 占位页 | 自动继承 960 |

验收命令：`npm run check:css` ✓ · `npm run typecheck` ✓ · `cd client && npx vitest run`（177 通过）✓
