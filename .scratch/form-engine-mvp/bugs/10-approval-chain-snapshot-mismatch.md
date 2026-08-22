# BUG-10 — 已提交实例的审批链视图使用活模板而非冻结快照（节点与审批记录错位）

**Status:** fixed
**记录日期:** 2026-08-22
**修复日期:** 2026-08-22
**来源:** 设计评审（审批链配置存储形态探讨，与 ADR-0015 同批）

## 现象

模板发布后设计者修改审批链，已提交实例的填单页/审批链侧栏渲染的是**修改后的活模板链**，而 `approval_records` 冻结在提交时的旧 `node_id` 上 → 节点与审批记录错位、匹配不上。

## 复现步骤

1. 发布含审批链的模板，提交一份实例（生成 approval_records，node_id 按当时链）
2. 设计者签出模板，增删/改名审批链节点，重新发布
3. 打开已提交实例的详情/侧栏 → 按新链渲染节点，旧记录对不上（或缺失）

## 期望行为

已提交（非 draft）实例渲染**快照**里的审批链（`template_snapshot.approval_chain`）；仅 draft 用活模板——与 schema 的既有处理一致（`resolveSchema.ts:14-17` 已对 schema 区分 draft/submitted）。

## 实际行为

`client/src/pages/filler/resolveSchema.ts:18-19` 与 `client/src/pages/filler/approvalSidebar.tsx:11` 无条件读 `detail.template.approval_chain`（活模板）。服务端实例详情其实已返回 `template_snapshot`（含 approval_chain，`instances.ts:357-360` 冻结），客户端未消费。

## 根因

快照冻结逻辑正确（`instances.ts:357-360`），但客户端渲染路径只消费了 schema 的快照、没消费 chain 的快照——同一文件的 schema/chain 处理不一致。

## 严重程度 / 优先级

**高**。设计意图（CONTEXT.md「FormInstance」：后续模板变更不影响已有实例）被破坏；审批操作 UI（工单 06）将依赖正确的链渲染。P0。

## 修复方向

- `resolveSchema.ts`：非 draft 时 chain 取 `template_snapshot.approval_chain`（与 schema 对称）
- `approvalSidebar.tsx`：同
- 补测试：已提交实例 + 模板审批链变更 → 侧栏仍按快照链渲染

## 修复记录

按 `/diagnosing-bugs` 流程执行（2026-08-22）：

- **回路（Phase 1-2）**：两 seam 红——`resolveSchema.test.ts`（已提交实例 `expected 'live-node' to be 'snap-node'`）、`approvalSidebar.test.tsx`（DOM 渲染活链「新链节点」+ 记录未挂上「提交后解析」）；draft 用例绿作副作用证明。
- **根因确认（Phase 3-4）**：H1（客户端两处无条件读活链，未按 `status` 分支）成立；H2（服务端响应缺 `approval_chain`）排除——`toInstance` 已 `parseJsonb` 解析 `template_snapshot`，`toInstanceDetail` 整行展开返回。
- **修复（Phase 5）**：
  - `resolveSchema.ts`：链与 `rawSchema` 对称——非 draft 读 `template_snapshot.approval_chain`，`?? detail.template.approval_chain` 兜底。
  - `approvalSidebar.tsx`：同分支逻辑。
  - 回归：两测试文件转绿；client 全量 28 文件 / 177 测试通过；`tsc --noEmit` 干净。
- **预防（post-mortem）**：schema 路径本就有 draft/submitted 区分而链路径没有，同文件内两条路径漂移未被发现。`ApprovalChainSidebar` 应消费 `resolveInstanceSchema` 的解析结果而非自行再读一次 `detail.template`——单一解析入口可防此漂移复发（后续可重构）。

## 关联

- ADR-0015（审批链引用治理）
- 工单 06（审批操作 UI）
- CONTEXT.md「FormInstance」（快照不变量）
