# 缺陷工单清单（Bugs）

本目录记录现场勘查与使用中发现的缺陷工单。每份工单一个文件，编号递增。
与 `issues/`（功能开发工单）不同，这里专注**缺陷清单**，修复可另排工单。

> 📌 **修复优先级与批次计划见 [FIX-PLAN.md](./FIX-PLAN.md)**

## 统计

- 总数：9（fixed 6 / open 3）
- 最近更新：2026-08-21

## 清单

| 编号 | 标题 | 类型 | 严重程度 | 状态 |
| --- | --- | --- | --- | --- |
| [BUG-01](./01-users-page-crud.md) | 用户管理页缺少增删改查完整能力（无新增/删除/编辑/筛选/分页） | 功能缺口 | 中 | 🟡 open |
| [BUG-02](./02-shell-sidebar-overflow.md) | Shell 侧边栏导航溢出 `<aside class="sidebar">` 边界 | UI | 低-中 | 🟢 fixed |
| [BUG-03](./03-page-layout-consistency.md) | 页面布局缺乏统一：仅「创建模板」居中符合原型，其余内容页均居左 | UI 建议/一致性 | 低 | 🟡 open |
| [BUG-04](./04-designer-template-meta-edit.md) | 设计器缺少「模板基本信息」编辑入口（模板名/描述/分类不可修改） | 功能缺口 | 中 | 🟢 fixed |
| [BUG-05](./05-designer-et-status-color.md) | 设计器 `et-status` 状态徽章缺少语义配色，签出前后颜色区分弱 | UI | 低-中 | 🟢 fixed |
| [BUG-06](./06-template-list-no-isolation.md) | 「我的模板」列表无数据隔离：不同账号可看到全部模板 | 数据隔离/越权可见 | 中-高 | 🟡 open |
| [BUG-07](./07-designer-no-readonly-guard.md) | 设计器「未签出」时仍可编辑：组件面板可拖拽到画布，无只读保护 | 编辑权限守卫缺失 | 中-高 | 🟢 fixed |
| [BUG-08](./08-users-page-limited-admin-crash.md) | 仅持 `admin:manage_users` 打开用户管理页整页报「加载用户失败」（页面误拉 `/roles` 被 403 拖垮） | 权限/页面错误 | 中 | 🟢 fixed |
| [BUG-09](./09-privilege-escalation-role-grant.md) | 越权提权：仅 `admin:manage_users` 可自授「管理员」角色（分配接口无授权范围校验） | 越权/安全 | 高 | 🟢 fixed |

## 图例

- 状态：🟡 open ／ 🟢 fixed ／ 🔵 verifying ／ 🔴 rejected
- 严重程度：高 / 中 / 低

## 关联

- `bugs/users.md` — 用户相关缺陷挂靠点（引用 `issues/17-login-logout-frontend-auth.md`）
