# 实施规格说明书：动态表单引擎 MVP

> 版本：v1.0
> 日期：2026-08-12
> 状态：就绪（ready-for-agent）
> 来源：基于 [设计规格 v1.2](design-spec-form-engine.md) + 6 项 ADR + C1-C14 整改决策

---

## Problem Statement

企业业务系统中，每个表单需要独立开发前端代码。中等复杂度表单开发 2-3 天，需求变更时修改成本高，各表单样式和交互难以统一。业务人员无技术能力自主创建模板，完全依赖开发团队。

本系统解决的核心问题：**让业务人员零代码创建模板、配置审批流程；员工在统一界面完成填写与审批追踪。**

目标规模：50 并发在线填写者，日均 100 次提交。

---

## Solution

一个**配置驱动的动态表单引擎**，采用 Schema → Engine → Component 三层架构：

```
表单设计者编排 Schema（JSON 配置）
        ↓
引擎解析 Schema，驱动渲染、验证、联动、审批流转
        ↓
填写者看到统一 UI，审批人通过内置工作流处理
```

**MVP 技术栈**：React 18 + Vite（前端），Express + PostgreSQL + JSONB（后端），SSE（实时通知），Docker Compose 部署。

---

## User Stories

### 表单设计者

1. As a 表单设计者, I want to 创建空白表单模板并设置名称、描述和分类, so that 建立表单元数据基础。
2. As a 表单设计者, I want to 从组件面板拖拽字段到画布并自由调整顺序, so that 可视化编排表单结构。
3. As a 表单设计者, I want to 选中字段后在属性面板配置标签、提示文本、默认值和验证规则, so that 精确控制字段行为。
4. As a 表单设计者, I want to 创建章节（字段分组）并支持折叠/展开, so that 组织复杂表单的布局层次。
5. As a 表单设计者, I want to 为字段配置单层 AND 显示条件（如"设备类型=研发 → 显示某字段"）, so that 根据上下文动态控制表单。
6. As a 表单设计者, I want to 在设计器右侧面板实时预览填写态效果, so that 即时验证设计效果。
7. As a 表单设计者, I want to 签出表单模板获得独占编辑权，完成后签入, so that 防止多人并发编辑冲突。
8. As a 表单设计者, I want to 将表单配置导出为可迁移文件并导入到其他环境, so that 通过 DEV→SIT→UAT→PROD 逐级验证后上线。
9. As a 表单设计者, I want to 为表单配置多级审批链（组织架构/角色/指定人员）, so that 提交后自动触发审批流转。

### 表单填写者

10. As a 填写者, I want to 浏览我有权限的已发布表单列表并支持搜索和分类筛选, so that 快速找到目标表单。
11. As a 填写者, I want to 按照设计者编排的结构依次填写字段, so that 完成信息录入。
12. As a 填写者, I want to 填写时实时看到字段验证反馈（必填未填、格式不符）, so that 提交前修正错误。
13. As a 填写者, I want to 将未完成的表单保存为草稿并稍后恢复继续填写, so that 不丢失已输入内容。
14. As a 填写者, I want to 草稿自动保存（失焦 + 30s 兜底）, so that 即使忘记手动保存数据也不丢失。
15. As a 填写者, I want to 打开草稿时被告知模板是否已更新且已有数据尽力匹配, so that 知道字段变化且数据不丢失。
16. As a 填写者, I want to 提交表单后在同一界面看到审批链状态（各级审批人、当前进度）, so that 了解流转进展。
17. As a 填写者, I want to 在审批人未处理时撤回已提交的表单, so that 修正错误后重新提交。
18. As a 填写者, I want to 在移动端浏览器中完整完成填写、提交和进度查看, so that 在手机和平板上工作。

### 审批人

19. As a 审批人, I want to 收到新审批请求的通知并一键进入审批界面, so that 及时处理。
20. As a 审批人, I want to 在审批界面同时看到完整表单内容（只读）和审批链状态, so that 充分了解上下文后决策。
21. As a 审批人, I want to 点击"同意"使审批流转至下一级或完成, so that 推进流程。
22. As a 审批人, I want to 点击"拒绝"并填写原因使流程终止, so that 否决不合规的提交。
23. As a 审批人, I want to 将表单退回给提交人要求修改, so that 补正不完整或错误信息。
24. As a 审批人, I want to 将审批转交给另一位指定人员, so that 在自身无法处理时分流。
25. As a 审批人, I want to 看到审批链上所有参与者的审批状态和意见, so that 了解完整审批上下文。

### 数据管理者

26. As a 被授权用户, I want to 按表单类型查看所有已提交的数据列表并支持筛选, so that 检索历史记录。
27. As a 被授权用户, I want to 查看单条提交的完整表单内容和审批历史, so that 了解详情。
28. As a 被授权用户, I want to 将筛选数据导出为 Excel, so that 用于离线分析或对接其他系统。
29. As a 被授权用户, I want to 查看按表单类型的提交量统计, so that 了解各表单使用情况。

### 系统管理员

30. As a 管理员, I want to 创建自定义角色并分配能力, so that 权限模型匹配组织实际职能。
31. As a 管理员, I want to 将角色分配给用户, so that 用户获得对应操作权限。
32. As a 管理员, I want to 在特殊情况下强制签入被锁定的模板, so that 解除异常锁定。

---

## Seams

测试应围绕以下模块边界（从内到外）：

### 一级 Seam：FormEngine 纯逻辑（推荐主要测试点）

这些模块零外部依赖——无 DOM、无数据库、无网络。纯函数/状态机，单元测试成本最低、价值最高：

- **SchemaParser**：Raw JSON → ParsedSchema IR。校验结构合法性、字段类型可识别、审批链完整性、子表单嵌套深度 ≤ 2。
- **ValidationEngine**：`validateField(fieldSchema, value) → FieldError[]`、`validateAll(parsedSchema, values) → AllErrors`。覆盖每种验证规则独立执行和组合执行。
- **ConditionEvaluator**：`evaluate(conditionNode, allValues) → boolean`。MVP 仅 AND 组合；每种运算符全覆盖。
- **VisibilityEngine**：基于当前 values 计算 fields/sections 可见性。单字段联动、章节级联动、依赖链重算。
- **FormStateManager**：reducer——`dispatch(action) → new State`。setValue 触发联动+验证；touched 追踪；dirty 标记。
- **ApprovalStateMachine**：`transition(currentState, action) → newState`。覆盖 7 个状态、6 种转换、合法与非法路径。基于属性测试生成随机序列验证不变量。
- **ApprovalResolver**：`resolveApprover(rule, submitter) → approver`。3 种规则类型；解析失败返回 null。

### 二级 Seam：API 端点

Express route handler——HTTP 请求 → 响应。可用 supertest + 测试数据库：

- 模板 CRUD、签出/签入、发布、导出/导入
- 实例提交（原子事务校验、模板状态校验）、草稿保存/恢复、撤回
- 审批操作（幂等、乐观锁冲突 409、状态机守卫）
- 通知列表、标记已读

### 三级 Seam：组件渲染

React Testing Library + 模拟 FormEngine：

- 字段组件按 FieldComponentProps 契约正确渲染
- 表单提交按钮 disabled 状态、防重点击
- 草稿自动保存状态指示器

### 端到端

4 条关键旅程（Cypress/Playwright）：

1. 设计者创建模板 → 拖拽字段 → 配置属性 → 配置审批链 → 发布 → 导出
2. 填写者浏览 → 打开表单 → 填写 → 保存草稿 → 恢复草稿 → 提交 → 查看审批进度
3. 审批人收到通知 → 查看待审批 → 审批同意/拒绝/退回/转交 → 流程完成
4. 移动端浏览器打开 → 表单适配单列 → 填写 → 提交

---

## Implementation Decisions

### 数据完整性

**ID-01：混合事务策略**。表单提交和审批操作的核心写入（Instance + Snapshot + ApprovalRecord）在同一个数据库事务中执行。事务提交后异步投递 Notification 持久化和 SSE push。审批人解析在事务内执行，失败回滚整个提交。详见 [ADR-0001](adr/0001-transaction-boundaries.md)。

**ID-02：审批接口幂等键**。`approve`、`reject`、`return`、`transfer` 四个接口强制 `Idempotency-Key` Header。24 小时幂等窗口。`submit` 不强制——前端防抖 + 乐观锁兜底。详见 [ADR-0002](adr/0002-idempotency-keys.md)。

### 并发控制

**ID-03：乐观锁**。`FormInstance` 和 `FormTemplate` 增加 `version` INT 列（从 1 开始）。UPDATE 的 WHERE 条件包含 `version = :expected`，SET `version = version + 1`。0 rows affected → 409 Conflict。撤回与审批竞态、重复提交均通过此机制消除。前端收到 409 后显示明确提示（"该提交已被撤回"）并自动刷新。详见 [ADR-0003](adr/0003-optimistic-locking.md)。

### 版本化

**ID-04：API 版本前缀**。所有路由使用 `/api/v1/`。前端在统一位置配置 base URL。

**ID-05：Schema 格式版本**。每个 JSONB Schema 根部必含 `schemaVersion` 字段（语义版本号，如 `"1.0.0"`）。引擎按版本解释，未知版本拒绝渲染。导出兼容策略：同主版本允许，跨主版本拒绝 + 手动迁移脚本。注意区分 `FormTemplate.version`（并发控制 INT）和 `schema.schemaVersion`（格式版本 string）。详见 [ADR-0005](adr/0005-schema-api-versioning.md)。

### 草稿与数据

**ID-06：草稿-模板版本不匹配**。打开草稿时比较 `draft.updatedAt` 与 `FormTemplate.updatedAt`。基于 fieldId 尽力映射——匹配的自动迁移，不匹配的移入 `_orphaned` 对象。界面顶部黄色提示条。详见 [ADR-0004](adr/0004-draft-template-version-mismatch.md)。

**ID-07：草稿自动保存**。onBlur 触发（dirty 检测）+ 30s 定时兜底。无变更不请求。界面显示"草稿已保存 X 秒前"。

**ID-08：提交时校验模板状态**。`POST /api/v1/instances/:id/submit` 必须确认 `template.status === 'published'`，否则拒绝提交。

### MVP 范围约束

**ID-09：条件编辑器 MVP**。仅支持单层 AND 条件（平铺条件行，不支持 OR 和嵌套分组）。数据格式预留升级路径——Phase 2 时旧格式自动包装为 AndCondition 节点。详见 [ADR-0006](adr/0006-mvp-condition-editor-scope.md)。

**ID-10：子表单深度**。最大嵌套 2 层（主表单 → 子表单 → 孙表单）。SchemaParser 校验拒绝更深嵌套。子表单内字段支持联动和验证。

**ID-11：模板无审批流程**。模板状态仅 `draft` / `published` / `archived`。设计者可直接发布。质量保障通过 UAT → PROD 环境晋升实现。

### 组织架构与通知

**ID-12：组织架构只读消费**。系统不维护部门树。通过 `OrgDataSource` 接口抽象（`getUser`、`searchUsers`、`getUserManager`），MVP 实现为静态 JSON 导入。UserPicker 和审批人解析通过该接口获取数据。后续可替换为企业微信/飞书/LDAP。

**ID-13：通知渠道适配器**。MVP 仅站内通知（SSE 实时 + 通知中心持久化）。NotificationService 投递层使用适配器模式——`InAppChannel`（默认），后续可插拔 Email、企微等渠道。

### 安全

**ID-14：CSRF 防护**。`httpOnly` Cookie 存储 JWT + `X-CSRF-Token` Header（值从独立非 httpOnly Cookie 读取）。所有非 GET 请求校验收 Token。

**ID-15：速率限制**。Express 中间件 + 内存计数：登录 5/min/IP、文件上传 20/min/用户、提交 10/min/用户、导出 5/hour/用户。

**ID-16：文件名消毒**。上传时丢弃原始路径，保留 basename，前加 UUID 前缀。存储路径必须在 `upload_root` 内验证通过。格式：`{upload_dir}/{uuid}_{sanitized_basename}`。

### 跨领域决策

**ID-17**：单租户（无 `tenant_id`）、仅中文（MVP）、结构化日志（Pino/Winston JSON + traceId）、Docker Compose 部署、进程内事件队列（MVP）、Knex 迁移、JWT 滑动过期（7 天 + `/api/v1/auth/refresh`）、统一错误格式 `{ error: { code, message, details? } }`、偏移量分页（page/pageSize，上限 100）、环境变量 + dotenv。

### 错误码

```
VALIDATION_ERROR          → 422  字段值校验失败
NOT_FOUND                 → 404  资源不存在
FORBIDDEN                 → 403  无权限操作（非资源所有者）
UNAUTHORIZED              → 401  未登录或登录已过期
INVALID_CREDENTIALS       → 401  邮箱或密码错误
CSRF_TOKEN_MISSING        → 403  缺少 CSRF Token
CSRF_TOKEN_MISMATCH       → 403  CSRF Token 不匹配
VERSION_CONFLICT          → 409  乐观锁冲突
IDEMPOTENCY_CONFLICT      → 409  幂等键重复（不同请求体）
EMAIL_TAKEN               → 409  邮箱已被其他用户占用
USER_SELF_OPERATION       → 409  不能删除/停用当前登录账号
LAST_ADMIN                → 409  不能删除/停用最后一个管理员
USER_HAS_TEMPLATES        → 409  该用户创建过模板，请先处理归属
USER_REFERENCED_IN_APPROVAL_CHAIN → 409  用户被模板审批链引用，无法硬删（ADR-0015 决策 1）
ROLE_REFERENCED_IN_APPROVAL_CHAIN → 409  角色被模板审批链引用，无法硬删（ADR-0015 决策 1）
TEMPLATE_LOCKED           → 409  模板已被他人签出（或已发布模板未签出即重发布）
TEMPLATE_NOT_DRAFT        → 400  模板非草稿，无法删除
TEMPLATE_ARCHIVED         → 400  模板已归档，只读不可编辑/签出/发布
TEMPLATE_NOT_PUBLISHED    → 400  模板未发布或已下线
APPROVAL_NOT_PENDING      → 400  审批已处理，无法操作
APPROVER_RESOLUTION_FAILED → 500  审批人解析失败（配置错误：审批人不存在/角色为空）
APPROVER_DISABLED         → 409  审批人已停用，提交被拦截（ADR-0015 ③）
SCHEMA_VERSION_UNKNOWN    → 400  Schema 版本不被引擎支持
DRAFT_EXPIRED             → 410  草稿已过期，无法继续（保留策略 BR-15，仅草稿状态实例）
RATE_LIMITED              → 429  触发速率限制
```

---

## Testing Decisions

### 什么构成好的测试

- 测试**外部行为**，不测试内部实现。验证给定输入 → 输出/副作用，不验证内部调用链。
- 一级 Seam 优先——纯逻辑模块用单元测试全覆盖。每个模块的错误路径必须至少和快乐路径一样多的测试分量。
- 集成测试覆盖 API 端点 + 数据库交互——重点验证事务边界和并发行为。
- E2E 仅覆盖 4 条关键旅程——不做边界用例的 E2E（成本高、运行慢）。

### 关键测试场景

**单元测试（Engine 模块）**：

| 模块 | 必须覆盖 |
|------|---------|
| SchemaParser | 合法 Schema 解析；缺少必填字段/未知 fieldType/空审批链/嵌套超深的拒绝；子表单深度边界（2 层通过，3 层拒绝） |
| ValidationEngine | 每种验证规则独立执行；组合规则执行；跨字段验证（如日期比较）；空值和边界值 |
| ConditionEvaluator | 每个运算符全覆盖；AND 短路求值；字段不存在/值为 null 的防御 |
| VisibilityEngine | 单字段联动；章节级联动；多字段依赖链；条件从 true→false 时子字段也隐藏 |
| FormStateManager | setValue 触发验证和联动；touched 仅在 onBlur 时 true；dirty 标记；reset/restore |
| ApprovalStateMachine | 合法转换执行；非法转换拒绝（如 approved→withdraw）；基于属性的测试——生成随机合法/非法序列，验证不变量（终态不可转变、每个状态可到达） |
| ApprovalResolver | org_structure/role/specific 三个规则；解析失败返回 null；解析结果正确映射到 User |

**集成测试**：

- 表单提交：原子写入验证（Instance + Snapshot + ApprovalRecord 要么全有要么全无）
- 提交时模板已下线 → 400
- 审批操作 + 幂等键：重复请求返回缓存结果
- 审批 + 乐观锁：version 不匹配返回 409
- 撤回 + 乐观锁：审批人已处理后撤回返回 409
- 草稿版本不匹配：打开时检测并正确生成 _orphaned
- 文件上传路径穿越：恶意文件名被消毒

**审批状态机属性测试（示例）**：

```
Given 状态机从 DRAFT 开始
When  生成随机合法动作序列
Then  验证不变量——
     - 终态（APPROVED, REJECTED）不可再 transition
     - WITHDRAWN 后状态回到 DRAFT
     - RETURNED 后重新 SUBMIT 从第一节点开始
Given 状态机在任意状态
When  生成随机非法动作
Then  全部被拒绝，状态不变
```

### E2E 旅程

仅 4 条，不增不减。每条覆盖一个完整的用户角色视角。

---

## Out of Scope

以下明确为 MVP 不做：

- **嵌套 AND/OR 条件编辑器**（Phase 2）
- **邮件/短信/企业微信通知渠道**（架构预留适配器接口，实现推迟）
- **移动端离线填写**（依赖 Service Worker）
- **可视化统计仪表板**（仅提供按模板类型计数）
- **多租户隔离**（企业内部单租户部署）
- **国际化/多语言**（仅中文）
- **React Query / 独立缓存层**（MVP 用自定义 hook + fetch）
- **Zustand 全局状态**（MVP 统一用 Context + useReducer）
- **独立任务队列（Redis/Bull）**（MVP 用进程内事件队列）
- **审批意见可见性粒度控制**（MVP 所有参与者可见）
- **审批超时自动处理**（人工跟进，无自动超时）
- **大于 1000 条的异步 Excel 导出**（MVP 同步导出限 1000 条）

---

## Further Notes

### 项目文档索引

| 文档 | 作用 |
|------|------|
| [CONTEXT.md](../CONTEXT.md) | 领域词汇表——术语唯一权威来源 |
| [requirements spec](requirement-spec-form-engine.md) v1.1 | 需求基线 |
| [product spec](product-spec-form-engine.md) v1.0 | 实现中立的用户故事和验收标准 |
| [design spec](design-spec-form-engine.md) v1.2 | 技术设计（组件、数据模型、API、安全） |
| [design review](design-review-report-form-engine.md) v1.0 | 设计评审报告（含 16 个问题 C1-C16） |
| [ADR-0001](adr/0001-transaction-boundaries.md) | C1：事务边界 |
| [ADR-0002](adr/0002-idempotency-keys.md) | C2：幂等键 |
| [ADR-0003](adr/0003-optimistic-locking.md) | C3：乐观锁 |
| [ADR-0004](adr/0004-draft-template-version-mismatch.md) | C6：草稿版本不匹配 |
| [ADR-0005](adr/0005-schema-api-versioning.md) | C8+C9：Schema 与 API 版本化 |
| [ADR-0006](adr/0006-mvp-condition-editor-scope.md) | C10：条件编辑器 MVP 范围 |

### 实施优先级

| 阶段 | 内容 |
|------|------|
| 立即 | 后端：数据库 schema + 迁移 + 事务基础设施 + FormEngine 核心模块（SchemaParser, ValidationEngine, ConditionEvaluator, ApprovalStateMachine） |
| 立即 | 前端：Component Registry + ComponentFactory + FormRenderer + 基础字段组件（text, number, select, date） |
| Phase 1 | 设计器（画布拖拽、属性面板、预览面板）、审批链配置、签出/签入 |
| Phase 1 | 填写器（表单填写页、草稿箱、提交、撤回）、审批操作（同意/拒绝/退回/转交） |
| Phase 1 | 通知系统（SSE + 通知中心）、数据管理（列表、查看、导出、统计） |
| Phase 1 | 安全（CSRF、速率限制、文件消毒）、权限管理（角色 CRUD + 分配） |
| Phase 2 | 嵌套 AND/OR 条件编辑器、多渠道通知、Zustand 引入（如确需） |
| Phase 2 | 负载/可访问性/视觉回归测试 |

### 审阅检查点

实施开始前确认：
- [x] C1-C14 全部决策已通过 ADR 或设计规格记录
- [x] API 路由全部使用 `/api/v1/` 前缀
- [x] 事务边界已文档化（§6.1）
- [x] 乐观锁 entity 字段已加入数据模型
- [x] 幂等键接口已标注
- [x] MVP 范围边界明确（条件编辑器、子表单深度、通知渠道、离线）

---

> 📌 **下一步**：本规格就绪后可直接进入编码。所有架构决策已在 ADR 中记录，所有模糊概念已在 CONTEXT.md 中澄清。遇到设计问题时回到本文档和关联的 ADR 寻找答案。
