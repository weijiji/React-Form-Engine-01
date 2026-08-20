# 21 — NL 对话创建表单

**What to build:** `/designer/create/nl` 从占位页落地为「自然语言创建」界面——用户像聊天一样描述表单需求，AI（Claude API）生成「表单结构建议」，本地规则引擎兜底（无 key/失败/长尾时）；用户预览编辑建议、确认后复用模板创建流（自动签出）跳转设计器。

**Blocked by:** 04 — 模板 API + 表单设计器（`POST /templates` 已就绪）；17 — 登录/权限（`template:create` 已就绪）

**Status:** ready-for-agent

**设计依据:** ADR-0013（AI 出简化建议结构 + 确定性翻译 + 规则兜底）；UX 规格 §4.2；sitemap `/designer/create/nl`；CONTEXT.md「表单结构建议（FormStructureSuggestion）」

---

- [x] **shared 纯逻辑（一级 seam，vitest 直测）**：
  - `shared/src/nlSuggestion.ts` 新增：
    - 类型：`NlFieldType`（text/textarea/number/select/radio/checkbox/date/datetime/file/user-picker 受限枚举）、`NlField`、`NlSection`、`FormStructureSuggestion`
    - `normalizeSuggestion(raw)` — 防御性归一化 LLM 输出（类型未知→text、缺名→占位、截断超长），结构缺失抛 `SuggestionError`
    - `matchRuleSuggestion(message)` — 6 个预置示例关键词匹配（请假/采购/设备报备/报销/出差/入职），未命中 → null
    - `translateSuggestion(suggestion)` — 建议 → 完整 schema（`schemaVersion:"1.0.0"` + 章节/字段 id + options 转 `{label,value}`），产出经 SchemaParser 校验合法
  - `shared/test/nlSuggestion.test.ts`：翻译结果可被 SchemaParser 接受；规则命中/未命中；归一化边界（非法类型、空字段）
- [x] **server：openapi.yaml（spec-first）+ 2 端点 + LLM 服务**：
  - `openapi.yaml` 增 `nl` tag、`POST /api/v1/nl/generate {message}→{suggestion}`、`POST /api/v1/nl/refine {message,suggestion}→{suggestion}`、`FormStructureSuggestion` schema → `npm run generate:api` 重生成 `shared/src/api.ts`
  - `.env.example` 增 `ANTHROPIC_API_KEY`（可选）、`ANTHROPIC_MODEL`（默认 Haiku 4.5）；server `config.ts` 读取
  - `server/src/services/nl.ts` — `generateSuggestion(message)` / `refineSuggestion(message, suggestion)`：有 key → Claude Messages API（tool-use 结构化输出）+ `normalizeSuggestion` + 失败回退 `matchRuleSuggestion`；无 key → 直接规则引擎
  - `server/src/routes/nl.ts` — `authenticate` + `requirePermission("template:create")`，POST 两个端点，校验 `message` 非空
  - 挂载 `app.ts` `/api/v1/nl`
  - 测试：`server/src/routes/nl.test.ts`（supertest + stub fetch）：无 key 走规则、LLM 输出归一化、LLM 失败回退、未登录 401、无权 403
- [x] **client：`NlCreatePage` 替换占位页**：
  - `client/src/pages/designer/NlCreatePage.tsx` — 聊天区（欢迎语 + 快捷示例 chips + 输入框）+ 建议预览卡（改模板名、字段标签/必填/删除、加字段、章节增删改名）
  - 确认 → `POST /templates`（`category:null`）→ 跳 `/designer/templates/:id`；「继续修改」→ 留在对话页发追加修正
  - 失败态：AI 气泡「没能理解，换个说法或点快捷示例」
  - 路由 `client/src/router/index.tsx` `/designer/create/nl` 由 `PlaceholderPage` 换成 `NlCreatePage`
- [x] **回归**：`npm run typecheck` + `cd shared && npx vitest run` + `cd server && npx vitest run`；手测 NL 生成 → 确认 → 进设计器全流程
