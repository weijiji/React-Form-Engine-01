# BUG-05 — 设计器 `et-status` 状态徽章缺少语义配色，签出前后颜色区分弱

**Status:** open
**记录日期:** 2026-08-19
**类型:** UI BUG

## 现象

设计器顶部状态徽章 `<span class="et-status">` 不随模板状态变化颜色。
签出前后视觉区分很弱 —— 例如模板为「已发布」时徽章以灰点 + 灰字呈现，
签出后仅小圆点变绿，外框与文字仍为灰色，观感上「颜色没有变化」。

## 复现步骤

1. 设计者打开一个「已发布」模板的设计器（未签出）
2. 观察 `.et-status`：灰点 + 文字「已发布」，容器灰底（`--bg-subtle`）灰字
3. 点击「签出并编辑」，观察状态：文案变为「已签出 · 正在编辑」、小圆点变绿，
   但徽章外框与文字颜色未变 —— 与「已发布」时相比整体配色几乎无差别

## 期望行为

- 状态徽章按模板状态映射**语义色**：如
  - 已发布 → 绿 / 品牌色
  - 草稿 / 未签出 → 中性灰
  - 他人锁定 → 琥珀 / 警告色
  - 已签出（编辑中）→ 品牌 / 强调色
- 签出前后、不同状态之间有明显颜色 + 文案双重区分

## 实际行为

- `.et-status` 容器固定 `background: var(--bg-subtle); color: var(--text-2)`；
  `.et-dot` 仅在 `isHolder`（当前用户持锁）时为绿色（`--success`），
  其余所有状态（草稿 / 已发布 / 已归档 / 他人锁定）都是灰点灰字 ——
  缺少状态 → 颜色的映射

## 涉及范围

- 前端：`client/src/pages/designer/DesignerPage.tsx`（`.et-status` 渲染，
  约 446 行）、`client/src/pages/designer/designer.css`
  （`.et-status` / `.et-dot` / `.et-dot.gray`）

## 根因分析

状态徽章只实现了「持锁与否」两点态（绿点 / 灰点），没有按
`statusText`（草稿 / 已发布 / 已归档 / 他人锁定 / 已签出）做完整的
语义配色映射；容器本身颜色固定，导致状态切换时整体观感不变。

## 严重程度 / 优先级

低-中（UI 状态可读性问题：模板状态是设计协作的关键信号，
配色不区分会降低可感知性）

## 建议修复方向（参考）

- 为 `.et-status` 增加状态变体（如 `is-published` / `is-locked` / `is-draft`
  / `is-holder`），按 `statusText` 派生类名映射语义色
- 保持与设计系统（ADR-0008）token 一致（`--success` / `--warning` /
  `--brand` 等），避免硬编码色值
- 修复后核对：各状态切换颜色/文案均变化；`npm run typecheck`

## 关联工单

- `issues/04-template-api-form-designer.md`（设计器）
- `docs/design-system-form-engine.md`（设计 token，ADR-0008）
