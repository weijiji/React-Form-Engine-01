# ADR-0009：门户路由模型 —— 5 角色门户，`/designer` 而非 `/admin`

> 日期：2026-08-13
> 状态：已采纳
> 关联：grilling 会话（设计系统对齐）

---

## 背景

三份文档/代码对「门户路由模型」给出互相矛盾的答案：

| 来源 | 模型 | `/admin` 含义 |
|------|------|---------------|
| `design-spec-form-engine.md` §5.1 | 2 门户：设计器端 `/admin` + 填写器端 `/`（审批/数据/统计混在填写器端） | 设计者门户 |
| `sitemap-form-engine.md` | 5 角色门户：`/designer` `/filler` `/approver` `/admin` `/ops`（约 40 路由） | 系统管理员门户 |
| `client/src/router/index.tsx` | 2 layout（`AdminLayout`/`UserLayout`），跟随 design-spec | 设计者门户 |

`/admin` 存在语义冲突：design-spec 与代码里它是「设计者门户」，sitemap 里它是「系统管理员门户」。问：哪一份是唯一权威。

## 决策

**以 `sitemap-form-engine.md` 的 5 角色门户（单 SPA）为唯一权威。** 具体：

1. 五个角色门户：`/designer`（模板设计者）、`/filler`（表单填写者）、`/approver`（审批人）、`/admin`（系统管理员）、`/ops`（运维人员）。
2. `/admin` 归「系统管理员」；**设计者门户改用 `/designer`**。
3. `design-spec-form-engine.md` §5.1 与 `client/src/router/index.tsx` 重写对齐（`AdminLayout`/`UserLayout` 合并为按角色渲染导航的共享 shell，见 ADR-0008）。

## 替代方案

- **保留 design-spec 的 2 门户**：拒绝。审批、数据、统计被糊在填写者门户下，违反 UX 规格 §2.1「角色分割导航」原则；且审批人是移动端优先、运维是 PROD 专属，2 门户无法表达这些差异。
- **剪裁门户数量（如 3 个）**：拒绝。五个角色是产品已定的边界——运维的 UAT→PROD 迁移是独立职责（见 sitemap §7），管理员与设计者也是不同角色。

## 后果

- **正面**：路由模型与产品/UX 的角色模型一致，`/admin` 语义不再有二义。
- **负面**：`/admin` 语义翻转——已有以 `/admin` 当设计者的代码/链接需迁移，这是本次对齐的主要成本。
- **负面**：未来读者看到「设计者走 `/designer`」会困惑为何不是 `/admin`——本 ADR 记录原因。
