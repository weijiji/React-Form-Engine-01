# 19 — 共享控件组件化（设计系统第一步，ADR-0011）

**What to build:** 把 `.btn` 家族等共享控件从各页 CSS 收敛成 `client/src/components/` 组件库（CSS Modules），designer / filler / login 全部切换并删除副本，废弃"每页样式表自包含"约定，加 `npm run check:css` 防回归守卫。

**Blocked by:** 14 — 设计令牌对齐（`global.css` 令牌已就绪，ADR-0008）

**Status:** done (awaiting code review)

- [x] **组件库**：新建 `client/src/components/`，五族组件 + 各自的 `.module.css`（令牌引用 `global.css`）：
  - `Button`（`variant: default|primary|ghost`，`size: default|sm|lg`，`disabled`，`icon` 槽位——吸收 `.btn` 家族 + `.btn .icon`；`lg`=40px 用于 login）
  - `IconButton`（`size: md|sm|xs`，`variant: default|danger`，`active` 态——吸收 `.icon-btn` 与各处 24/22px 上下文尺寸）
  - `Segmented`（`options` + `value`/`onChange`，吸收 `.seg`）
  - `Input`（`size: default|sm|lg`，icon 槽位 + wrapper，`className`/`inputClassName`——吸收 `.input-wrap` / `.input-sm` / `.input:focus` / `::placeholder`）
  - `Badge`（`green` / `amber` / `gray` / `indigo`，`dot`——吸收 `.badge` 与 `.badge .dot`）
- [x] **designer 三页切换**（DesignerPage / TemplatesPage / CreateTemplatePage）+ 子组件（DesignCanvas / StructureTree / PropertyPanel 的 `.icon-btn` 与 `.input`）：JSX 用组件替换裸类，删 `designer.css`、`templates.css` 中五族定义
- [x] **filler 四页切换**（FormCenter / FormFillPage / MyDrafts / MySubmissions）：同上，删 `filler.css` 顶部 `.btn` 块
- [x] **login 切换**：用 `<Button/>`（`size="lg"`）/ `<Input/>`（`size="lg"`）替换，删 `.login .btn` / `.login .input` 覆盖
- [x] 删除 `templates.css` 顶部"自包含镜像"注释；`.icon` 全局工具类移入 `global.css`（18px），组件内图标尺寸收进各模块
- [x] **防回归**：`package.json` 加 `check:css`（`client/scripts/check-css.mjs` + root 委托）；共享类清单与组件库保持同步（注释注明）
- [x] 验证：`npm run typecheck` + `npm run build` + 测试全绿（client 21 文件/118 用例，shared 8 文件/103 用例）+ `npm run check:css` 通过

> 注：`admin.css` 保持 `.rbac-*` 命名空间不动（止血带），待 admin 页面被触及再切组件（ADR-0011 决策 4）。落地基线：develop（`issues/19-shared-control-componentization` 分支），不混入 hotfix 分支改动。
