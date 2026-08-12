# 02 — 表单引擎核心（纯逻辑模块）

**What to build:** 7 个零外部依赖的纯逻辑模块，构成表单引擎的大脑。每个模块可通过单元测试独立验证——不需要浏览器、不需要数据库、不需要网络。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] **SchemaParser**：Raw JSON → ParsedSchema IR。校验：Schema 结构合法性、fieldType 可识别、审批链完整性、子表单嵌套深度 ≤ 2（≥3 拒绝）、`schemaVersion` 字段必存在。`info-text` 支持 visibilityCondition，文本内容为静态。
- [ ] **ValidationEngine**：`validateField(fieldSchema, value) → FieldError[]` + `validateAll(parsedSchema, values) → AllErrors`。覆盖：必填、minLength/maxLength、min/max、正则、文件类型/大小/数量、跨字段验证（如结束日期 > 开始日期）。对子表单递归验证。
- [ ] **ConditionEvaluator**：支持 10 种运算符（equals、notEquals、contains、notContains、greaterThan、lessThan、isEmpty、isNotEmpty、in、notIn）。MVP 仅 AND 组合（条件数组隐式 AND）。字段不存在或值为 null 时优雅处理（非崩溃）。
- [ ] **VisibilityEngine**：给定 ParsedSchema + values → 返回每个 field/section 的可见性 boolean map。字段从可见变为不可见时子字段也隐藏。仅重算依赖链上的字段（构建依赖图），非全量遍历。
- [ ] **FormStateManager**：reducer 模式——`dispatch(action) → new State`。状态结构：values、errors、visibility、disabled、touched、dirty、submitting。setValue → 更新 values → 重算 visibility → 重算 errors。touched 仅在 onBlur 时标记 true。reset/restore 正确恢复。
- [ ] **ApprovalStateMachine**：7 状态 × 6 动作 × 多角色。合法转换全部执行；非法转换全部拒绝（返回错误原因）。**基于属性的测试**：生成随机合法/非法动作序列，验证不变量（终态不可再转、每个状态可达、RETURNED 后重新 SUBMIT 从第一节点开始）。
- [ ] **ApprovalResolver**：`resolveApprover(rule, submitter, orgDataSource) → approver | null`。三种规则类型：`org_structure`（直属上级）、`role`（角色下用户）、`specific`（指定人员）。解析失败返回 null 并标记原因。`OrgDataSource` 接口定义为 `{ getUser, searchUsers, getUserManager, getUsersByDepartment }`。
