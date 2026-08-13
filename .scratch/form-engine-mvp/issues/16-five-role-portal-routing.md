# 16 — 5 角色门户路由

**What to build:** 把路由从 2 layout 重构为 sitemap 定义的 5 角色门户（ADR-0009），`/admin` 归系统管理员、设计者改 `/designer`；并同步重写设计规格 §5.1。

**Blocked by:** 15 — 共享门户壳

**Status:** ready-for-agent

- [ ] **5 门户骨架**：router 拆为 5 个门户前缀 `/designer` `/filler` `/approver` `/admin` `/ops`，各自挂 `Shell` + 角色导航；根路径按角色重定向到对应门户
- [ ] **语义翻转**：`/admin` = 系统管理员（用户/角色/数据/统计/模板强制签入导航）；设计者迁移到 `/designer`（模板/创建/草稿/导出导航）
- [ ] **接入已有页面**：`TemplatesPage` 迁到 `/designer/templates`；`HomePage`/`PreviewPage` 落到合适门户；其余门户（filler/approver/ops 及 admin 详情页）先放占位或 404，随对应工单填充
- [ ] **同步设计规格**：重写 `docs/design-spec-form-engine.md` §5.1 的 2 门户路由结构为 sitemap 的 5 门户（`/designer`/`/filler`/`/approver`/`/admin`/`/ops`），消除与 sitemap 的矛盾
- [ ] 验证：`npm run typecheck` + `npm run build` 绿；`/designer`、`/filler`、`/approver`、`/admin`、`/ops` 各自渲染正确壳 + 导航 + 根重定向；`/designer/templates` 可访问；`/admin` 不再是设计者门户
