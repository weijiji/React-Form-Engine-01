# 14 — 设计 token 系统对齐（Canvas Workbench）

**What to build:** 引入「画布工作台 Canvas Workbench」设计 token 词汇（ADR-0008），并把客户端所有共享样式从 Ant Design 蓝迁移到新 token。迁移后 app 整体翻 indigo，且构建保持绿。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] **引入 token**：在客户端全局样式定义「画布工作台」token 词汇（来源 `prototype/assets/app.css`，权威见 `docs/design-system-form-engine.md` §1）：品牌色 `--brand`/`--brand-strong`/`--brand-soft`/`--brand-line`，中性色 `--bg`/`--bg-subtle`/`--surface`/`--border`/`--border-strong`/`--text`/`--text-2`/`--text-3`，语义色 `--success(-bg)`/`--warning(-bg)`/`--danger(-bg)`/`--info(-bg)`/`--purple(-bg)`，圆角 `--r-sm`/`--r`/`--r-lg`/`--r-xl`，阴影 `--shadow-sm`/`--shadow`/`--shadow-lg`，字体 `--font`/`--mono`
- [ ] **迁移共享样式**：`global.css` 与 `form.css` 全部改吃新 token——删掉硬编码 antd 色（`#1677ff`/`#0958d9`/`#e6f4ff`/`#adc6ff`/`#cf1322`/`#fff1f0`/`#52c41a`/`#ff4d4f`/`#faad14`/`#333`/`#666`/`#e0e0e0`/`#f5f5f5` 等），改用对应新 token
- [ ] **桥接旧名（展开）**：把仍在被 `AdminLayout`/`UserLayout` 内联样式引用的旧变量 `--color-*`、`--sidebar-width`、`--header-height` 以别名指向新 token（如 `--color-primary: var(--brand)`、`--sidebar-width: 236px`、`--header-height: 60px`），保证迁移期间 app 不破、整体翻 indigo
- [ ] 验证：`npm run typecheck` + `npm run build` 绿；浏览器里表单控件、按钮、焦点环均呈现 indigo 而非 antd 蓝；CSS 文件（`client/src/**/*.css`）不再含 antd 硬编码色
