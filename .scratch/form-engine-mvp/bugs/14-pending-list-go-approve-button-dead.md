# BUG-14 — 待审批列表「去审批」按钮无响应：按钮无 onClick，且单元格 `stopPropagation` 吞掉行点击

**Status:** fixed
**记录日期:** 2026-08-22
**修复日期:** 2026-08-22
**来源:** 现场使用（工单 06 审批操作 UI）

## 现象

待审批列表中每行「去审批」按钮点击**没有任何效果**（不跳转、无反馈）；
反而点击整行（行内任意空白处）才会跳转到审批详情页。主操作按钮形同虚设。

## 复现步骤

1. 审批人登录，进入待审批列表（`/approver/pending`）
2. 点任意一行的「去审批」按钮 → **无任何反应**
3. 点击该行非按钮区域（整行）→ 正常跳转审批详情页
4. 尝试键盘焦点 Enter 激活按钮 → 同样无效果

## 期望行为

点击「去审批」按钮即跳转审批详情页（`/approver/approvals/:id`），与点击整行
行为一致；按钮是行的主操作入口，应可独立点击。

## 实际行为

- `client/src/pages/approver/ApprovalPendingList.tsx`：
  - 行 `<tr onClick={() => navigate(...)}>` 绑定跳转 ✓
  - 操作列 `<td className="filler-actions" onClick={(e) => e.stopPropagation()}>`
    把按钮区的点击**冒泡拦截**，阻止了行级跳转
  - 而按钮本身 **没有 `onClick`**：`<Button size="sm">去审批</Button>` 只是
    静态标签 → 既无自己的处理器，又挡住了行级导航 → 点击即「吞掉」

## 涉及范围

- 前端：`client/src/pages/approver/ApprovalPendingList.tsx`（「去审批」按钮缺
  onClick + 操作列 stopPropagation）
- 测试：`client/src/pages/approver/ApprovalPendingList.test.tsx`（现有用例未覆盖
  按钮点击行为）

## 根因分析

「去审批」按钮是**未接线的手势壳**：UI 上存在，但事件层既没绑导航（无 onClick），
又因所在单元格 `stopPropagation` 被排除在行级导航之外——两层都落空，形成
「点击无效」的死按钮。对比：同目录 `MySubmissions.tsx` 的「继续填写/查看/撤回」
按钮均显式绑定 onClick，此处为遗漏。

## 严重程度 / 优先级

中（P2）。审批主操作入口失效，只能靠点整行跳转，可发现性差；但存在可用
替代路径（点行），非阻断。修复成本极低，可与 BUG-13 同批处理。

## 建议修复方向（参考）

1. 给「去审批」按钮补 `onClick={() => navigate(`/approver/approvals/${item.approval.id}`)}`
2. 确认操作列 `stopPropagation` 的取舍：若列内仅此一个按钮，可去掉
   `stopPropagation` 交由行级导航；若后续列内会加多按钮，则保留并逐个显式绑定
3. 补测试：点击「去审批」→ 断言跳转（`navigate` 被调用且路径正确）
4. 顺手统一：核查其他列表页操作列按钮（`MySubmissions` 等）是否都存在 onClick

## 关联

- `issues/06-approval-engine-operations-ui.md`（工单 06）
- 同现场发现的 BUG-13（审批操作 409「节点不匹配」差一错误）
- 对照：`client/src/pages/filler/MySubmissions.tsx`（操作按钮显式绑 onClick 的
  正确先例）

## 修复记录（2026-08-22）

**改动**（`client/src/pages/approver/ApprovalPendingList.tsx`）：
- 「去审批」按钮补 `onClick={() => navigate(\`/approver/approvals/${item.approval.id}\`)}`，
  成为行的独立主操作入口（原生 `<button>`，键盘 Enter/Space 同样生效）
- 保留单元格 `stopPropagation`：按钮自有导航，点击不再冒泡触发行级重复导航
- 注释注明缘由（BUG-14）

**全库核查**（bug 报告建议 4）：`MySubmissions` / `TemplatesPage` 操作按钮均显式
绑 `onClick`，仅本处遗漏。

**回归测试**（先红后绿）：`ApprovalPendingList.test.tsx` 新增「点击「去审批」按钮
→ 跳转审批详情」；点击按钮 → 断言目标路由渲染 `审批详情-rec-1`。修复前此用例
失败（点击后目标路由不出现），修复后通过。

**验证**：client 全量 191（+1）/ 190 → 191 全绿，typecheck 通过。
