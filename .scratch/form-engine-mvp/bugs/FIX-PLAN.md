# 缺陷修复计划（FIX PLAN）

**创建日期:** 2026-08-19
**原则:** 先修「错误行为」（越权/误操作）→ 再补「缺失能力」→ 最后统一「观感」。
避免在错误的权限/隔离地基上做 UI。

## 优先级排序（建议执行顺序）

| 序 | BUG | 标题 | 类型 | 严重 | 优先级 | 依赖/前置 |
| --- | --- | --- | --- | --- | --- | --- |
| ① | [BUG-07](./07-designer-no-readonly-guard.md) | 设计器「未签出」仍可编辑，无只读保护 | 权限守卫缺失 | 中-高 | **P0** | 无（独立，修复成本最低） |
| ② | [BUG-06](./06-template-list-no-isolation.md) | 「我的模板」无数据隔离，越权可见 | 数据隔离/越权 | 中-高 | **P0** | ⚠️ 需产品确认可见性策略 |
| ③ | [BUG-01](./01-users-page-crud.md) | 用户管理缺增删改查完整能力 | 功能缺口 | 中 | **P1** | 建议与 ② 衔接成「账号治理」闭环 |
| ④ | [BUG-04](./04-designer-template-meta-edit.md) | 设计器缺模板基本信息编辑入口 | 功能缺口 | 中 | **P1** | 无（独立） |
| ⑤ | [BUG-05](./05-designer-et-status-color.md) | `et-status` 状态徽章缺语义配色 | UI | 低-中 | **P2** | 建议与 ① 同批（同在设计器状态区） |
| ⑥ | [BUG-02](./02-shell-sidebar-overflow.md) | 侧边栏导航溢出 sidebar 边界 | UI | 低-中 | **P2** | 无（独立小修） |
| ⑦ | [BUG-03](./03-page-layout-consistency.md) | 全站布局缺乏统一（大整顿） | UI 专项 | 低 | **P3** | 🎨 需 UI/UX 设计师介入；可吸收 ⑤⑥ |

## 批次打包

### 批次 A — 权限与数据安全（先上）
- **BUG-07** + **BUG-06**
- 前置：BUG-06 需产品一句话确认「模板默认可见范围 = 仅本人创建？」
- 完成标准：未签出/他人锁定/已归档 → 设计器只读；不同账号模板互相不可见

### 批次 B — 能力补齐
- **BUG-01** + **BUG-04**
- 说明：① 补齐用户增删改/筛选/分页（账号治理），④ 补齐模板基本信息编辑
- 契约：均需先 `openapi.yaml` 建模 → `npm run generate:api`

### 批次 C — UI / 设计系统
- **BUG-05** + **BUG-02**（小修，可先行）
- 最后并入 **BUG-03** 全站布局统一专项（需设计师，单独排期）

## 执行检查清单

- [ ] **BUG-07**：抽 `readonly = !isHolder` 下传 Palette/Canvas/PropertyPanel；
      变更函数加 `if (!isHolder) return` 兜底；已归档整体只读
- [ ] **BUG-06**：`GET /templates` 按 `created_by` 过滤 + 详情/操作归属校验；
      多账号隔离测试
- [ ] **BUG-01**：`POST /users`、`PATCH /users/:id`、`DELETE /users/:id` +
      分页/筛选；openapi + 前端表格与交互
- [ ] **BUG-04**：`PATCH /templates/:id/meta`（name/description/category）+
      `.editor-top` 编辑入口
- [ ] **BUG-05**：`.et-status` 按状态映射语义色变体
- [ ] **BUG-02**：`.nav-group { flex:1; min-height:0; overflow-y:auto }`（或 overflow:hidden 兜底）
- [ ] **BUG-03**：全站页面容器盘点 → 统一规范（`.page-narrow`）→ 共享容器 → 逐页迁移

## 决策点（需他人介入）

| 决策 | 责任方 | 影响 |
| --- | --- | --- |
| 模板可见性策略：默认「仅本人」？是否需要「全部/共享」视图？ | 产品 | 阻塞 BUG-06 |
| 删除用户时关联数据（FormInstance/ApprovalRecord/Draft）处理策略 | 产品/技术 | BUG-01 |
| 全站布局统一规范定稿 | UI/UX 设计师 | BUG-03 |
