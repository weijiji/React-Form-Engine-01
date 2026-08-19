# BUG-02 — Shell 侧边栏未完美包裹导航：`<nav class="nav-group">` 内容溢出 `<aside class="sidebar">` 边界

**Status:** open
**记录日期:** 2026-08-19
**类型:** UI BUG

## 现象

共享 Shell 侧边栏中，`<nav class="nav-group">` 的内容（导航分组 + 条目）
没有被 `<aside class="sidebar">` 完美包裹：当导航项较多（如管理员全 20 权限码、
多分组）或视口高度较矮时，导航内容向下溢出 `aside.sidebar` 的区域边界。

## 复现步骤

1. 以管理员（拥有全部导航分组）登录进入任一受保护页面
2. 将浏览器视口高度调矮（或将窗口缩小），使导航条目总高度超过视口高度
3. 观察侧边栏：导航项溢出 `.sidebar` 底部边界，`sidebar-foot`（用户区）被
   顶出或导航内容盖到其上方 / 侧边栏外部

## 期望行为

- `<nav class="nav-group">` 内容始终被 `.sidebar` 完整包裹
- 导航区域超高时在侧边栏内部滚动（`overflow-y: auto`），不溢出、不遮挡
  `sidebar-foot` 用户区；或侧边栏高度随内容自适应

## 实际行为

- 导航内容垂直溢出 `.sidebar` 边界，未被裁切，也无内部滚动

## 涉及范围

- 前端：`client/src/layouts/Shell.tsx`（`<aside className="sidebar">` → `<nav className="nav-group">` → `sidebar-foot` 结构）
- 样式：`client/src/layouts/Shell.css`

## 根因分析

`.sidebar` 采用了固定高度布局：

```css
.sidebar {
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  /* 无 overflow 控制 */
}
```

- `height: 100vh` 固定侧边栏高度，而 `.nav-group`（flex 子项）未设置
  `flex: 1; min-height: 0; overflow-y: auto`，内容超高时 flex 子项不会
  收缩到内容高度之下，导致内容从容器底部溢出
- `.sidebar` 未设 `overflow: hidden` 兜底裁切，溢出部分直接视觉外漏
- `sidebar-foot` 依赖 `margin-top: auto` 贴底，被超高导航顶出边界

（全局已设置 `box-sizing: border-box`，宽度方向正常；此为纯垂直溢出问题）

## 严重程度 / 优先级

低-中（纯 UI 瑕疵，不影响功能与数据；仅在导航项多 + 视口矮时可见，
管理员 / 高权限用户最易触发）

## 建议修复方向（参考）

- 方案 A：`.nav-group { flex: 1; min-height: 0; overflow-y: auto; }`，让导航区
  独立滚动，`sidebar-foot` 保持贴底
- 方案 B：`.sidebar { overflow: hidden; }` 兜底裁切（不滚动，仅防外漏）
- 修复后验证：管理员全导航 + 矮视口下无溢出；`npm run typecheck` + 相关 UI 测试

## 关联工单

- `issues/15-shared-portal-shell.md`（Shell 结构来源，ADR-0008 设计系统）
- `issues/16-five-role-portal-routing.md`（5 角色门户路由，导航分组）
