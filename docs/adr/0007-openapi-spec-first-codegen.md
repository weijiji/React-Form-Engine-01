# ADR-0007：API 契约 —— Spec-first OpenAPI + openapi-typescript 类型生成

> 日期：2026-08-13
> 状态：已采纳
> 关联：grilling 会话（前后端分离确认 + OpenAPI 引入）

---

## 背景

项目为前后端分离的 SPA + REST API 架构（`server/` Express + `client/` React + `shared/` 纯逻辑）。客户端 [apiClient](../../client/src/config/api.ts) 是手写泛型、无类型契约；13 个工单将引入几十个端点，客户端与服务端的类型漂移是最大痛点。问：是否引入 OpenAPI 契约，以及契约从哪来、生成什么。

## 决策

1. **Spec-first**：手写 `openapi.yaml`（仓库根）作为 API 契约的单一事实来源。端点沿用 ADR-0005 的 `/api/v1` 前缀。
2. **类型生成**：用 `openapi-typescript` 从 spec 生成**纯类型**（无运行时），输出到 `shared/src/api.ts`（form-engine-core 包）。保留手写 `apiClient`（已封装 CSRF/cookie/错误处理），让它消费生成类型。
3. **完整度**：现在只写已实现的 `GET /api/v1/health` + 通用组件（错误 envelope、标准头 `Idempotency-Key`/`X-CSRF-Token`/`X-Trace-Id`）+ 核心资源 schema（`FormTemplate`/`FormInstance`/`ApprovalRecord`/`Draft`/`Notification`，来自 DB 迁移）。端点随工单逐个补，不前向写满 13 个工单。
4. **SSE**（工单 07 通知）不纳入 OpenAPI schema，单独说明——OpenAPI 3.x 对 SSE 支持弱。

## 替代方案

- **Code-first（Zod/tsoa 从代码生成 spec）**：拒绝。server 是裸 Express、无 request/response schema 层，需先重构所有 handler；且 spec-first 让后续工单能「按契约实现」。
- **生成完整 fetch client（@hey-api/openapi-ts）**：拒绝。现有 `apiClient` 已封装 CSRF 注入、credentials、错误 envelope 解析，替换无净收益。
- **前向写满 13 个工单所有端点**：拒绝。spec 会「撒谎」、TDD 过程中反复改。

## 后果

- **正面**：客户端与 server 共享单一类型契约，消除手写泛型漂移；后续工单有契约可依。
- **正面**：生成物是纯类型（零运行时依赖），符合 form-engine-core 定位。
- **负面**：手写 spec 可能漂移——靠「类型从 spec 生成 + 提交进 typecheck」约束，spec 更新仍需人工维护。运行时校验（express-openapi-validator）留待以后按需引入。
