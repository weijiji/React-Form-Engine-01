# ADR-0008：设计系统单一权威来源 —— 原型「画布工作台」token + 共享 shell

> 日期：2026-08-13
> 状态：已采纳
> 关联：grilling 会话（设计系统对齐）

---

## 背景

仓库里存在三套互相矛盾的设计 token 词汇，且没有任何一份文档化的权威：

| 来源 | 品牌色 | 性质 |
|------|--------|------|
| `prototype/assets/app.css` | `--brand:#4f46e5`（indigo） | 唯一**刻意设计**的完整系统「画布工作台 Canvas Workbench」：色彩/圆角/阴影/字体/语义态齐全 |
| `client/src/styles/global.css` | `--color-primary:#1677ff`（antd 蓝） | Ant Design 默认色板，非设计选择 |
| `client/src/form/form.css` | 混合硬编码 antd 色 | 与上面两套都不同 |

门户壳同理：原型是浅色侧栏（236px）+ 顶栏（60px）+ indigo 品牌；代码 `AdminLayout` 是 antd 深色侧栏 `#001529`（240px/56px），`UserLayout` 只有顶栏无侧栏。问：以哪一套为唯一权威，其余全部对齐。

## 决策

1. **设计 token 以原型 `prototype/assets/app.css` 为唯一权威**。设计系统名为「画布工作台 Canvas Workbench」。antd 蓝全部弃用；命名一并采纳原型方案（`--brand`、`--text-2`、`--r-lg`…，而非 `--color-primary`、`--color-text-secondary`）。
2. **门户壳为一套共享 shell**：浅色侧栏 236px + 顶栏 60px + indigo 品牌，5 个角色门户复用同一 shell、仅导航项不同；`designer-edit` 保留独立的 `.editor` 三栏全屏工作台。

## 替代方案

- **以代码 antd 蓝为准，把原型改回 antd**：拒绝。antd 色板是未设计的默认值，原型才是唯一经过设计的 token 系统；保留 antd 等于放弃已投入的设计。
- **每角色独立 chrome（设计者侧栏 / 填写者顶栏 / 审批移动优先）**：拒绝。MVP 阶段单一共享 shell 更省，且「按角色显示不同导航」已在路由层通过不同导航项体现，不需要不同的壳。

## 后果

- **正面**：token 有了单一权威，代码/原型/文档不再漂移。
- **负面**：需全局重写 `client` 的 CSS（`global.css` + `form.css` + 两个 layout 的内联样式）——这是一次性的机械改动，随工单进行。
- **负面**：未来读者会困惑「为何弃用 antd 蓝、为何颜色变 indigo」——本 ADR 记录原因。
