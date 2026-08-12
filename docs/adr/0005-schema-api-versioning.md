# ADR-0005：Schema 与 API 版本化策略

> 日期：2026-08-12
> 状态：已采纳
> 关联问题：设计评审 C8（中）、C9（中）、C5 Q-06

---

## 背景

C8 和 C9 同属版本化问题，一并决策。Q-06（配置导出兼容策略）也与 Schema 版本化共享同一个 `schemaVersion` 字段。

- **C8**：JSONB Schema 结构一定会演进（新增字段类型、验证规则、条件 AST 格式）。数据库中已有模板是旧格式，引擎如何解释？
- **C9**：REST API 目前无版本前缀。API 演进时旧客户端直接崩溃。
- **Q-06**：配置导出/导入的版本兼容策略？

## 决策

### API 版本化（C9）

**所有路由使用 `/api/v1/` 前缀**。

```
原                           → 新
POST /api/templates          → POST /api/v1/templates
GET  /api/instances/:id      → GET  /api/v1/instances/:id
POST /api/approvals/:id/approve → POST /api/v1/approvals/:id/approve
...
```

不做 `/api/latest` 别名——强制显式版本避免客户端隐式依赖未知行为。

### Schema 版本化（C8）

**每个 JSONB Schema 根部必须包含 `schemaVersion` 字段**（语义版本号，如 `"1.0.0"`）。

```json
{
  "schemaVersion": "1.0.0",
  "sections": [...]
}
```

引擎加载时读取 `schemaVersion`：
- **已知版本** → 正常解析
- **未知版本** → 拒绝渲染，记录日志，触发告警

**不做运行时自动迁移**。系统大版本升级时提供一次性迁移脚本（管理员手动执行），将数据库中所有模板的 Schema JSONB 升级。

### 版本号命名

两个"version"概念独立，不混淆：

| 概念 | 字段 | 类型 | 用途 |
|------|------|------|------|
| 并发控制版本 | `FormTemplate.version` | INT | 乐观锁，每次 UPDATE +1 |
| Schema 格式版本 | `schema.schemaVersion` | VARCHAR(20) | 语义版本，代表 JSON 结构的格式 |

### 导出兼容策略（Q-06）

导入时比较 major 版本：
- `import.major === system.major` → 允许
- `import.major > system.major` → 拒绝（"配置文件版本过高"）
- `import.major < system.major` → 拒绝（"配置文件版本过旧，请使用迁移工具"）

## 替代方案

### 不版本化 API

路由不加前缀，等需要时再加。**拒绝原因**：现在加是改路由字符串（成本≈0），以后加是需要同时维护 `/api/v1/...` 和 `/api/v2/...` 两套处理器并逐步迁移客户端（成本≈多周）。

### 运行时多版本 Schema 兼容

引擎同时支持 v1 和 v2 格式，按 `schemaVersion` 选择不同的解析逻辑。**拒绝原因**：解析器复杂度随版本数线性增长，且每个版本组合可能有隐蔽的交互 bug。一次只支持一个版本更安全。

## 后果

- **正面**：零成本在第一时间建立版本边界
- **正面**：`schemaVersion` 既用于存储校验也用于导出兼容检查——单一事实来源
- **负面**：大版本升级时需要手动运行迁移脚本——但大版本升级本身就应该有人工验证步骤
