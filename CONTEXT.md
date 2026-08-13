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

## 角色与门户

### 角色（Role）

系统内**固定的五种角色**，决定用户登录后进入哪个门户、拥有哪些能力。角色由系统预定义（MVP 不动态创建）。

枚举：`模板设计者`、`表单填写者`、`审批人`、`系统管理员`、`运维人员`。

_Avoid_: 用户组、权限组、岗位

### 门户（Portal）

按角色分割的独立入口区域。用户登录后按角色路由到对应门户，不同角色看到完全不同的导航结构。

五个门户：`/designer`（模板设计者）、`/filler`（表单填写者）、`/approver`（审批人）、`/admin`（系统管理员）、`/ops`（运维人员）。

_Avoid_: 后台、控制台、管理端

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

- [设计系统](docs/design-system-form-engine.md) —— 设计 token 词汇表与门户壳（chrome）规格（实现细节，不在本词汇表内）
- [Sitemap](docs/sitemap-form-engine.md) —— 门户路由模型（5 角色门户）

---

> **维护规则**：术语更新随领域建模讨论即时修改。本文件不含实现细节（框架、数据库、API 路径）。
