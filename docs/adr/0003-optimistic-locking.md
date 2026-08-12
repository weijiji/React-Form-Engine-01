# ADR-0003：乐观锁——撤回与审批竞态控制

> 日期：2026-08-12
> 状态：已采纳
> 关联问题：设计评审 C3（高）

---

## 背景

撤回操作（提交人撤回已提交表单）与审批操作（审批人同意/拒绝）存在 TOCTOU 竞态窗口：

```
T1: 提交人点击"撤回" → 检查"审批人未处理" ✓
T2: 审批人点击"同意" → 检查"审批人未处理" ✓
T3: 撤回执行 → Instance.status = 'draft'
T4: 审批执行 → ApprovalRecord.action = 'approved'
结果：Instance 回到 draft 状态，但 ApprovalRecord 显示已审批 → 数据不一致
```

两个操作同时检查、同时通过、同时写入。必须用并发控制消除窗口。

## 决策

**对 `FormInstance` 增加 `version` 列（整数，INSERT 时初始化为 1），所有状态变更的 UPDATE 使用乐观锁。**

### 机制

```sql
-- 撤回
UPDATE form_instances
SET status = 'draft', version = version + 1, updated_at = NOW()
WHERE id = :id AND version = :expected_version AND status = 'submitted';

-- 审批同意
UPDATE form_instances
SET status = 'in_approval', current_node_index = current_node_index + 1, version = version + 1
WHERE id = :id AND version = :expected_version AND status = 'submitted';
```

**冲突处理**：0 rows affected → 并发冲突 → 返回 HTTP 409 Conflict，body 包含最新状态描述。

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "该提交已被撤回"  // 或 "该审批已被处理"
  }
}
```

前端收到 409 后：显示明确提示 → 自动刷新页面或跳转到列表。

### 适用范围

| 实体 | 需要 version | 理由 |
|------|-------------|------|
| `FormInstance` | **是** | 撤回与审批竞态 + 重复提交 |
| `FormTemplate` | **是** | 并发编辑保存（签出锁已保护创建者，但管理员强制解锁时可能的冲突） |
| `ApprovalRecord` | 否 | 关联的 Instance version 已保护 |

## 替代方案

### 悲观锁（SELECT FOR UPDATE）

在事务中先 SELECT FOR UPDATE 锁定 Instance 行，再执行操作。**拒绝原因**：
- 竞态窗口极窄（人在 UI 点按钮，非机器高频并发），悲观锁的事务持有开销不划算
- C1 的事务策略已覆盖核心写入，悲观锁会让事务边界更复杂
- 冲突率预期极低（<0.1%），乐观锁的重试成本可以忽略

### 无并发控制

仅依赖"审批人未处理"的前置检查。**拒绝原因**：TOCTOU 窗口本质上是时间差，检查与写入之间永远有间隙。唯一消除间隙的方式是原子化的"检查+写入"——乐观锁的 WHERE version 正是这个作用。

### 撤回操作改用状态机守卫

在状态机中定义撤回仅从 `submitted` 状态合法，审批操作将状态变为 `in_approval` 后撤回自然失败。**部分采纳**：状态机守卫是最外层防线，乐观锁是最内层防线。两者一起用——状态机阻止明显非法操作，乐观锁处理并发边界。

## 后果

- **正面**：撤回与审批竞态被消除；重复提交被拦截（version 不匹配）；实现简单，不需要额外的锁基础设施
- **正面**：冲突时用户看到明确提示（"已被撤回"/"已被处理"），而不是通用错误
- **负面**：所有 Instance/Template 的 UPDATE 需额外携带 version，查询时需返回 version（前端需保存并回传）
- **负面**：极低冲突率下乐观锁是被动开销——但每个 UPDATE 多一个 WHERE 条件几乎是零成本
