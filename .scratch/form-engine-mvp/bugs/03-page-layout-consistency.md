# BUG-03 — 页面布局缺乏统一：仅「创建模板」居中符合原型，其余内容页均居左

**Status:** fixed
**记录日期:** 2026-08-19
**修复日期:** 2026-08-22
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

> 经 UI/UX Lead 走查定稿：**宽度收敛到壳层，标准容器为「流体 + 上限 1440px 居中」**。
> 数据密集页（网格/表格）随视口增长，消灭大屏「孤岛」；表单/任务页收窄内层度量。
> 原型 `.page-narrow` 与 DS 文档 980 → 960 → 1440（流体）同步更新。

### 决策记录（grilling 逐项确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 宽度体系 | **流体 + 上限 1440px 居中**：数据密集页随视口增长（大屏零孤岛），表单/任务页收窄内层度量；设计器工作台（Shell 外）不动 |
| 2 | 落位机制 | 宽度收敛到 Shell `.page`（默认流体 1440 居中），表单/任务页显式收窄 |
| 3 | 内层度量 | 表单/任务页：`.fill` 960 / `.create` 960 / `.nl` 760 / `.blank` 640——页面随屏铺开，行宽不失控 |
| 9 | 创建页度量 | 创建入口（`/designer/create`）是双卡片决策页，1440 流体下卡片被拉至 ~660px 异常空旷 → 特定 **960px** 居中（与 `.fill` 同档，每卡 ~460px） |
| 4 | 重复标题 | 用户/角色管理页重复 h2 **砍掉**（顶栏 h1 单一标题），纳入本专项 |
| 5 | 间距/响应式 | `.page` 默认 `padding:24px`，`@media ≤768px` 收 16px（复用现有断点） |
| 6 | 移动端导航 | **汉堡 + off-canvas 抽屉**：≤768px 侧栏移出视口，顶栏汉堡滑入覆盖层 + 遮罩；路由切换/点遮罩/点导航自动关闭（否决底部 tab：5 组权限导航塞不进 tab） |
| 7 | 回归验证 | check:css + typecheck + client vitest + 三宽度手动走查清单 |
| 8 | 设计器顶栏动作 | `.et-actions` 按「生产区 \| 结束区」心智模型重构：发布/重新发布为**唯一 primary**（目的地 CTA）、签入**降为次要**（上锁=结束编辑）、删除 danger **隔离末尾**防误触；图标互换——签出=开锁（Unlock，打开编辑）/ 签入=上锁（Lock） |

### 改动清单

- `client/src/layouts/Shell.css`：`.page` 加 `max-width:1440px; margin:0 auto; width:100%` + 768 断点
- `client/src/pages/designer/templates.css`：`.create` 特定 960px 度量（决策 #9）；`.blank` 改注为表单内层度量（640）；`.tpl-grid` 改流体 min 公式
- `client/src/pages/filler/filler.css`：`.form-grid` 同步流体 min 公式（与 `.tpl-grid` 同一套）
- `client/src/pages/designer/nl.css`：`.nl` 设为任务页度量 760px（页面流体，聊天不拉满）
- `client/src/pages/filler/filler.css`：`.fill` 设为表单页度量 960px（双栏行宽舒适）
- `client/src/pages/admin/admin.css`：删 `.rbac` 宽度；`.rbac-toolbar` 改 `flex-end`；删死代码 `.rbac-title`
- `client/src/pages/admin/UsersPage.tsx` / `RolesPage.tsx`：删重复 `<h2>`
- `client/src/layouts/Shell.tsx`：加抽屉状态（`useState` + 路由切换自动关闭）+ 顶栏汉堡按钮 + 覆盖遮罩
- `client/src/layouts/icons.tsx`：新增 `MenuIcon`（汉堡）
- `client/src/layouts/Shell.css`：`.nav-toggle` / `.sidebar-backdrop` 桌面隐藏；`≤768px` 侧栏转 fixed off-canvas 抽屉（`translateX` 过渡 + 遮罩 `z-index` 分层）
- `client/src/layouts/Shell.test.tsx`：新增 2 用例（汉堡开/遮罩关、路由切换关）
- `docs/design-system-form-engine.md`：shell 图 `.page-narrow` → 1440 流体 + 768 断点 + 内层度量说明；`.editor-top` 动作分组说明
- `prototype/assets/app.css`：`.page-narrow` → 1440（保持「原型即源」）
- `client/src/pages/designer/DesignerPage.tsx`：`.et-actions` 按「生产区 | 结束区」重构（决策 #8）——发布唯一 primary、签入降次要、删除 danger 移末尾、图标互换
- `client/src/pages/designer/DesignerPage.test.tsx`：工具栏可见性用例注释同步分组语义
- 设计器工作台（`/designer/templates/:id`）：Shell 外，`.page` 容器改动**不涉及**；仅顶栏 `.et-actions` 按钮按决策 #8 定稿重构

### 手动走查清单（回归基线）

多宽度 × 全部 Shell 路由，逐页核对：居中、**大屏下内容随屏增长（无孤岛）**、无贴边、标题不重复。

视口：`1440px` / `1920px` / `1024px` / `375px`（有条件加 `2560px+` 鱼尾屏看浏览页是否铺开）

| 路由 | 页面 | 走查要点 |
|---|---|---|
| `（全站）` | Shell 移动端抽屉 | 375px 下：顶栏出现汉堡；点开 → 侧栏滑入覆盖 + 遮罩；点遮罩 / 导航项 / 路由变化 → 关闭；内容区不再被 236px 侧栏挤压 |
| `（全站）` | 大屏流体 | 1920px+ 下：模板/表单网格多列铺开，无大片留白 |
| `/designer/templates` | 我的模板 | 卡片网格随屏多列，1440 内铺开 |
| `/designer/create` | 创建模板 | 引导语 h2 保留；双卡决策页特定 960 居中，1440 下卡片不拉宽（决策 #9） |
| `/designer/create/nl` | 自然语言创建 | 任务页 760 居中，气泡不拉满 |
| `/designer/create/blank` | 空白模板 | 表单卡 640 居中，页面流体 |
| `/designer/drafts` | 草稿模板（占位） | 自动继承流体 1440 |
| `/filler/forms` | 表单中心 | 卡片网格随屏多列 |
| `/filler/instances/:id` | 填写表单 | 表单页 960 度量：双栏表单列 ~576px + 审批链 320px，不随大屏拉满 |
| `/filler/drafts` / `/filler/submissions` | 草稿 / 提交 | 表格居中 |
| `/approver/pending` / `/approver/history` | 审批（占位） | 自动继承流体 1440 |
| `/admin/users` / `/admin/roles` | 用户 / 角色管理 | **无重复标题**；工具栏按钮右对齐 |
| `/admin/*`、`/ops/*` | 占位页 | 自动继承流体 1440 |

验收命令：`npm run check:css` ✓ · `npm run typecheck` ✓ · `cd client && npx vitest run`（177 通过）✓
