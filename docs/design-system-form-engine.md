# 设计系统：动态表单引擎

> 设计系统名：画布工作台（Canvas Workbench）
> 权威来源：[`prototype/assets/app.css`](../prototype/assets/app.css)（v08）是 token 与共享 shell 的**唯一事实来源**（ADR-0008）
> 路由模型：见 [`sitemap-form-engine.md`](sitemap-form-engine.md)（ADR-0010）
> 日期：2026-08-13

本文档是设计系统的唯一权威。代码、原型、其他文档与此处冲突时，以此处为准。token 与壳是实现细节，**不进入 `CONTEXT.md`**（它只做领域词汇表）。

---

## 1. 设计 token 词汇表

### 1.1 品牌色

| Token | 值 | 用途 |
|-------|-----|------|
| `--brand` | `#4f46e5` | 主品牌色（主按钮、激活态、链接） |
| `--brand-strong` | `#4338ca` | 品牌色 hover / 按压 |
| `--brand-soft` | `#eef2ff` | 品牌色浅底（选中态背景、focus 环） |
| `--brand-line` | `#c7d2fe` | 品牌色描边（激活边框、badge 边框） |

### 1.2 中性色

| Token | 值 | 用途 |
|-------|-----|------|
| `--bg` | `#f4f5f8` | 页面底色 |
| `--bg-subtle` | `#fafbfc` | 次级底色（hover、表头） |
| `--surface` | `#ffffff` | 卡片 / 面板表面 |
| `--border` | `#e7e9f0` | 常规描边 |
| `--border-strong` | `#d4d7e2` | 强调描边（输入框边框） |
| `--text` | `#23262f` | 主文本 |
| `--text-2` | `#5a6072` | 次级文本 |
| `--text-3` | `#9096a6` | 辅助 / 占位文本 |

### 1.3 语义色

| 语义 | 前景 | 背景 |
|------|------|------|
| 成功 | `--success: #15803d` | `--success-bg: #e7f6ee` |
| 警告 | `--warning: #b45309` | `--warning-bg: #fdf3e2` |
| 危险 | `--danger: #dc2626` | `--danger-bg: #fdecec` |
| 信息 | `--info: #0e7490` | `--info-bg: #e4f5f8` |
| 紫色 | `--purple: #7c3aed` | `--purple-bg: #f1ebfe` |

### 1.4 字体

| Token | 值 |
|-------|-----|
| `--font` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif` |
| `--mono` | `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace` |

正文字号 14px，行高 1.6。

### 1.5 圆角

| Token | 值 |
|-------|-----|
| `--r-sm` | `6px` |
| `--r` | `10px` |
| `--r-lg` | `14px` |
| `--r-xl` | `18px` |

### 1.6 阴影

| Token | 值 |
|-------|-----|
| `--shadow-sm` | `0 1px 2px rgba(24, 28, 45, 0.05)` |
| `--shadow` | `0 6px 24px rgba(24, 28, 45, 0.08)` |
| `--shadow-lg` | `0 18px 50px rgba(24, 28, 45, 0.16)` |

### 1.7 命名约定

采用原型命名（`--brand`、`--text-2`、`--r-lg`），**废弃** antd 风格命名（`--color-primary`、`--color-text-secondary`）。语义色带 `-bg` 后缀表示浅底版本。

---

## 2. 共享 shell

所有已登录页面复用**同一套 shell**（ADR-0008），导航项按用户权限码过滤（ADR-0010）。

```
.shell                          flex，min-height:100vh
├── .sidebar     236px          浅色（--surface），右侧描边，sticky 全高
│   ├── .brand                   品牌标识（logo 渐变 --brand→#7c3aed + 名称）
│   ├── .nav-group / .nav-item  导航（激活态 --brand-soft 底 + --brand 文字）
│   └── .sidebar-foot            用户 chip（头像 + 姓名 + 角色）
└── .main        flex:1
    ├── .topbar  60px            顶栏（--surface，底描边，标题 + 面包屑 + 操作区 + 通知铃）
    └── .page    padding:24px    页面内容（标准容器 .page-narrow max-width:960px，居中；≤768px 时 padding 收 16px，BUG-03）
```

- 侧栏宽 **236px**（不是 240px）；顶栏高 **60px**（不是 56px）。
- 公共页（login / 403 / 404 / notifications）复用 `.auth-bg` / `.error-page` / `.notif-layout`，不使用 shell。

### 设计器编辑页（例外工作台）

`designer-edit` 是全屏工作台，使用独立的 `.editor`，不用上面的 shell：

```
.editor                          height:100vh，column
├── .editor-top  58px            工作台顶栏（名称 + 签出/签入状态 + 保存/发布）
└── .editor-body flex
    ├── .comp-panel  244px       组件面板（左侧）
    ├── .canvas      flex:1      画布（点阵背景 + 居中预览）
    └── .side-panel  368px       结构树 + 属性面板（右侧）
```

---

## 3. 路由模型（权限码驱动）

见 [`sitemap-form-engine.md`](sitemap-form-engine.md)（ADR-0010）。摘要：

| 角色 | 路由前缀 | 设备 |
|------|---------|------|
| 模板设计者 | `/designer` | 桌面端 |
| 表单填写者 | `/filler` | PC + 移动端 |
| 审批人 | `/approver` | 移动端优先 + PC |
| 系统管理员 | `/admin` | 桌面端 |
| 运维人员 | `/ops` | 桌面端 |
