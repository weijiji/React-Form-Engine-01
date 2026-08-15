# ADR-0011：共享控件组件库 —— 取代"自包含镜像"约定

> 日期：2026-08-15
> 状态：已采纳
> 关联：工单 19（共享控件组件化）；延续 ADR-0008（设计系统来源）

---

## 背景

共享控件（`.btn` 家族 / `.icon` / `.icon-btn` / `.seg` / `.input` / `.badge`）在多个页面样式表里**逐字复制**：

- `.btn` 及 `:hover` / `.btn-primary` / `.btn-primary:hover` / `.btn-ghost` / `.btn-sm` / `.btn[disabled]` / `.btn .icon` 在 `designer.css`、`filler.css`、`templates.css` **三处**相同；
- `.icon` / `.icon-btn`（含 `:hover` / `svg`）/ `.seg`（含 `button` / `button.active`）/ `.input`（含 `:focus` / `::placeholder`）在 `designer.css`、`templates.css` **两处**相同。

合计 **19 个跨文件重复选择器**。`templates.css` 顶部注释把"共享控件在各页本地镜像、保持每页样式表自包含"写成**约定**——重复是这条约定的直接产物。

Vite 会把所有页面 CSS 打进同一个全局样式表，重复选择器按打包顺序互相覆盖。此前已真实踩坑：`admin.css` 无前缀的 `.editor-body` 覆盖了 designer 的 `.editor-body`，导致三栏画布塌掉；上一提交（2297edf）给 `admin.css` 加 `.rbac-*` 前缀止血，但只解决冲突、未解决重复，且引入了第二种约定。

现状梳理：`form.css`（`.form-*`）、`login.css`（`.login-*`）早已命名空间化；`admin.css` 已 `.rbac-*`；`Shell.css` 为单文件、无重复；`global.css` 是令牌唯一来源（ADR-0008）。重复集中在**组件规则**层，令牌本身没有重复。

## 决策

1. **新建 `client/src/components/` 组件库**，首批五族：`Button`（`variant: default|primary|ghost`，`size: default|sm|lg`，`disabled`，`icon` 槽位）、`IconButton`、`Segmented`、`Input`（`size: default|sm|lg`，icon 槽位，吸收 `.input-wrap` / `.input-sm`）、`Badge`（`green` / `amber` / `gray` / `indigo`）。样式用 **CSS Modules**（Vite 原生、零新依赖），令牌继续引用 `global.css`。
2. **designer 三页 + filler 四页 + login 切换到组件**，删除各页 CSS 中五族副本，以及 `templates.css` 顶部的"自包含镜像"注释。
3. **废弃"每页样式表自包含"约定**：共享控件唯一来源 = 组件库。
4. **`admin.css` 保持 `.rbac-*` 命名空间作为止血带**，不并入本次；待 admin 页面后续被触及再切组件，届时命名空间自然作废。
5. **防回归**：CLAUDE.md 记录约定 + `npm run check:css` 守卫脚本（共享裸类出现在非 `components/` 的 CSS 即失败）。脚本在工单 19 落地。
6. **落地为独立工单（19），一次 PR**。原定从 main 分支做，实际因 main 严重落后，经确认改以 **develop** 为基线（分支 `issues/19-shared-control-componentization`），不混入 hotfix 分支的改动（ADR-0010 未并入）。

## 替代方案

- **共享全局 CSS（`components.css`）收敛重复**：拒绝。仍是全局选择器，冲突风险只能靠约定约束，等于换地方埋雷。
- **保持镜像 + 全量加前缀**（把 admin.css 的止血路线推广到所有页面）：拒绝。只解决冲突、不解决重复，与本次目标相反。
- **CSS-in-JS / styled-components**：拒绝。新增依赖，MVP（React 18 + Vite，~50 并发）无此需要。
- **Tailwind 等工具类框架**：拒绝。全量改写 + 新依赖，明显过度。
- **命名空间与组件库长期共存**：拒绝。两者是正交机制，长期共存徒增心智负担；命名空间只作为过渡期止血带（见决策 4）。

## 后果

- **正面**：共享控件单一来源，重复消除；CSS Modules 作用域隔离根治全局冲突；令牌体系不变（ADR-0008），设计系统从令牌层推进到组件层。
- **正面**：守卫脚本机械拦截"第 N+1 个页面又手抄一份 `.btn`"。
- **负面**：一次迁移牵动 7 个页面 + login，改动面大（用户确认一次 PR 落地）。
- **负面**：过渡期 `admin.css`（`.rbac-*`）与组件库两种模式并存，直至 admin 页切组件。
- **负面**：守卫脚本是新的维护产物，需随组件库演进更新共享类清单。
