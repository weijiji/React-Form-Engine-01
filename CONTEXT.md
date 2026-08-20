# 动态表单引擎 — 领域词汇表

> 本文档定义系统中的核心术语。它是语义的唯一权威来源——当代码、设计文档、对话中使用这些词时，必须与此处定义一致。

---

## 核心实体

### FormTemplate（表单模板）

设计者创建的表单定义。包含表单结构（Schema）、审批链配置、分类、版本号。模板是配置的**单一事实来源**，引擎将其翻译为 UI 和行为。

**状态**：`draft`（编辑中）→ `published`（已发布，用户可填写）→ `archived`（已归档，不可新建实例）

> 模板**不存在审批流程**。质量保障通过环境晋升实现：UAT 充分测试 → PROD 迁移。参见 `docs/requirement-spec-form-engine.md` v1.1 第 3 节。

### FormInstance（表单实例）

用户提交表单时创建的运行时记录。绑定提交时刻的模板快照（`template_snapshot`），后续模板变更不影响已有实例。

**状态**：`draft` → `submitted` → `in_approval` → `approved` | `rejected` | `returned` | `withdrawn`

### ApprovalRecord（审批记录）

审批链上一个审批节点的执行记录。实例提交时创建第一条，审批流转时逐节点创建。

**动作**：`pending` → `approved` | `rejected` | `returned` | `transferred`

### Draft（草稿）

用户未完成填写的中间状态。与 Instance 的 `draft` 状态不同：Draft 是独立实体，`field_values` 为部分填写内容。草稿保留 2 年，超期清除。

**版本不匹配**：打开草稿时若模板已更新，基于 fieldId 尽力映射——匹配的值迁移，不匹配的移入 `_orphaned` 对象。界面顶部黄色提示。

**自动保存**：onBlur + 30s 定时兜底 + dirty 检测。无变更时不请求。

### Notification（通知）

关键业务事件触发的消息。**at-most-once 实时投递**（SSE push），**at-least-once 持久化**（数据库 INSERT）。两者走不同的可靠路径。

**渠道适配器**：投递层使用适配器模式——MVP 仅 `InAppChannel`。后续可插拔 Email、企微等渠道，不影响核心逻辑。

### OrgDataSource（组织架构数据源）

用户数据和审批人解析的统一接口。系统**只读消费**，不维护部门树。MVP 实现为静态 JSON 导入，后续可替换为企业微信/飞书/LDAP。

### SchemaVersion（Schema 格式版本）

JSONB Schema 根部的 `schemaVersion` 字段（语义版本号，如 `"1.0.0"`）。引擎按版本解释——未知版本拒绝渲染。不同于 `FormTemplate.version`（并发控制，INT）。版本兼容策略：同主版本允许导入，跨主版本拒绝。

---

## 角色与路由区域

### 角色（Role）

**权限角色**（`roles` 表）是权限码（permission code）的集合，决定用户拥有的具体能力；由系统管理员在后台动态创建与维护（工单 09），seed 预置「管理员」「设计者」「填写者」「审批者」「运维」五个角色（工单 17 由原「管理员」「普通用户」拆分而来）。五种工作角色（模板设计者、表单填写者、审批人、系统管理员、运维人员）是产品约定的人称，对应不同的权限码集合。

_Avoid_: 用户组、权限组、岗位

### 路由前缀（Route prefix）

`/designer /filler /approver /admin /ops` 为纯路径组织，**无门户语义**：不做身份判断、不含门禁、不代表角色。访问的唯一事实来源是权限码（ADR-0010）：侧边栏按权限码过滤显示，根路径 `/` 重定向到权限解锁的第一个导航项，每个页面按自己的所需权限码门禁。

_Avoid_: 门户、后台、控制台、管理端

---

## 模板归属与可见性

### 模板归属（Template ownership）

`FormTemplate` 的创建者（`created_by`）是该模板读写权限的根。创建者可读写自己创建的模板；持有 `template:view_all` 权限的角色（管理员、运维）可只读查看全部模板；其余用户对非本人模板既不可见、也不可写（访问时按「不存在」处理，避免暴露存在性）。

### 模板可见范围（Template visibility scope）

模板列表有两种可见范围：**仅本人**（默认，即「我的模板」）与**全部**（需 `template:view_all` 权限，即管理员「模板管理」与运维「模板查看」，只读）。写操作仅创建者本人可做；唯一的越权例外是 `force-unlock` —— 管理员可对他人模板强制解锁，但不可编辑、发布或删除他人模板。

---

## 核心操作

### 表单提交（Submit）

原子操作：在**同一数据库事务**中创建 Instance + 快照 Template + ApprovalRecord。事务后异步投递 Notification + SSE push。

### 审批操作（Approve / Reject / Return / Transfer）

对当前审批节点的决策。需要 **`Idempotency-Key`**（24 小时窗口）。使用乐观锁（`FormInstance.version`）防止竞态。

### 撤回（Withdraw）

提交人在审批人未处理时将 Instance 恢复为 `draft`。与审批操作存在竞态窗口，通过乐观锁解决。

### 签出 / 签入（Checkout / Checkin）

模板编辑的独占锁机制。同一时间仅一人可编辑。管理员可强制解锁。

### 条件编辑器（Condition Editor）

MVP 仅支持单层 AND 条件（平铺条件行，不支持 OR 和嵌套）。完整嵌套 AND/OR AST 编辑器推迟至 Phase 2。条件数据格式有兼容升级路径——旧格式自动包装为 AndCondition 节点。

### 子表单（Subform）

可增删行的表格/结构化数据。最大嵌套深度 2 层（主表单 → 子表单 → 孙表单）。子表单内字段支持条件联动和验证。

---

## NL 创建

### 表单结构建议（FormStructureSuggestion）

NL 创建流程中，AI 根据用户自然语言描述生成的中间结构，用户预览、编辑并确认后由服务端翻译为 `FormTemplate` 的 schema。它**不是**模板 schema——不含 `schemaVersion`、字段 id、验证规则；仅含模板名、可选描述与章节（章节内为字段清单：标签 / 类型 / 必填 / 选项）。字段类型为受限枚举（text / textarea / number / select / radio / checkbox / date / datetime / file / user-picker），未识别一律落为 `text`。

_Avoid_: 生成 schema、AI 结构

---

## 并发控制

### 乐观锁（Optimistic Locking）

`FormInstance` 和 `FormTemplate` 使用 `version` 列（整数，从 1 开始）。UPDATE 时 WHERE 条件包含 `version = :expected`，并 `SET version = version + 1`。0 rows affected → 冲突 → 返回 409。

适用于：撤回 vs 审批竞态、重复提交、并发保存。

### 幂等键（Idempotency Key）

写操作客户端生成唯一 key，服务端存储 key → response。24 小时后可回收。重复请求返回缓存结果，不重复执行。

---

## 事务

### 事务边界（Transaction Boundary）

数据库事务保护 Instance + Snapshot + ApprovalRecord 的原子写入。事务外（异步）：Notification 持久化 + SSE push。审批人解析在事务内执行——失败回滚整个提交。

---

## 关联文档

- [设计系统](docs/design-system-form-engine.md) —— 设计 token 词汇表与共享 shell（chrome）规格（实现细节，不在本词汇表内）
- [Sitemap](docs/sitemap-form-engine.md) —— 路由模型（5 个路由前缀区域，权限码驱动，ADR-0010）

---

> **维护规则**：术语更新随领域建模讨论即时修改。本文件不含实现细节（框架、数据库、API 路径）。
