# 15 — 共享门户壳（Shell）

**What to build:** 用一个共享 `Shell` 组件替换 `AdminLayout`/`UserLayout`，对齐原型 `.shell`（浅色侧栏 236px + 顶栏 60px + indigo 品牌），5 个门户复用同一壳、仅导航项不同（ADR-0008）。

**Blocked by:** 14 — 设计 token 系统对齐

**Status:** done

- [x] **Shell 组件**：实现侧栏（236px 浅色、品牌标识、导航分组/导航项、底部用户 chip）+ 顶栏（60px、标题/面包屑、操作区、通知铃）+ 内容区（padding 24px），样式对齐 `prototype/assets/app.css` 的 `.shell`/`.sidebar`/`.topbar`/`.page` 与 `docs/design-system-form-engine.md` §2
- [x] **导航按角色配置**：导航项改为数据驱动（每个门户传入自己的导航清单），激活态用 `--brand-soft` 底 + `--brand` 文字
- [x] **替换并删除旧 layout**：router 里的 `AdminLayout`/`UserLayout` 引用改指向 `Shell`；删除 `AdminLayout.tsx`/`UserLayout.tsx` 及其中内联的 antd 样式（含 `#001529` 深色侧栏）
- [x] **收缩旧名**：删除 14 遗留的 `--color-*`/`--sidebar-width`/`--header-height` 桥接别名——全库不再引用
- [x] 验证：`npm run typecheck` + `npm run build` 绿；app 以浅色侧栏 + 顶栏渲染；`grep` 全库无 `--color-*`、无 `#001529`、无 `AdminLayout`/`UserLayout` 残留
