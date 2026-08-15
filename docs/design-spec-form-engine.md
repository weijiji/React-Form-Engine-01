# 设计规格说明书：动态表单引擎

> 版本：v1.2
> 日期：2026-08-12
> 来源：产品规格说明书 v1.0
> 修订依据：设计评审报告 C1-C14 全面整改（C1-C4 严重/高 + C5-C14 中）

---

## 1. 架构总览

### 1.1 系统分层

```
┌──────────────────────────────────────────────────────────────┐
│                      客户端层 (Client)                        │
│  ┌─────────────────────┐  ┌─────────────────────────────┐    │
│  │  表单设计器 (Admin)   │  │   表单填写器 (End-User)       │    │
│  │  ┌───────────────┐  │  │  ┌───────────────────────┐  │    │
│  │  │ 设计器 Shell   │  │  │  │ 表单中心 + 草稿箱      │  │    │
│  │  │ 画布 + 属性面板 │  │  │  │ 审批视图 + 通知中心    │  │    │
│  │  │ 审批链配置     │  │  │  │ 数据管理 + 统计看板    │  │    │
│  │  └───────┬───────┘  │  │  └───────────┬───────────┘  │    │
│  │          │           │  │              │               │    │
│  │  ┌───────┴───────────┴──┴──────────────┴───────────┐  │    │
│  │  │              共享：表单引擎核心 (Form Engine)       │  │    │
│  │  │  Schema 解析器 │ 组件工厂 │ 状态管理 │ 验证引擎     │  │    │
│  │  │  条件求值器    │ 联动引擎                         │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / REST
┌──────────────────────────────┴───────────────────────────────┐
│                      服务端层 (Server)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ 模板服务  │ │ 实例服务  │ │ 审批引擎  │ │  通知服务     │    │
│  │ CRUD     │ │ 提交/草稿 │ │ 状态机    │ │  事件监听     │    │
│  │ 签出/签入 │ │ 查询/导出 │ │ 流转/解析 │ │  消息投递     │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘    │
│       └─────────────┴────────────┴──────────────┘             │
│                          │                                     │
│  ┌───────────────────────┴───────────────────────────────┐    │
│  │              共享：权限服务 │ 文件存储 │ 审计日志        │    │
│  └───────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────┴───────────────────────────────┐
│                      数据层 (Data)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ 模板存储  │ │ 实例存储  │ │ 审批记录  │ │  用户与权限   │    │
│  │ (JSON)   │ │ (JSON)   │ │          │ │              │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │
│  ┌──────────┐ ┌──────────┐                                   │
│  │ 文件存储  │ │ 通知队列  │                                   │
│  └──────────┘ └──────────┘                                   │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 应用 |
|------|------|
| **Schema 驱动** | 表单的结构、验证、联动、审批链全部由 JSON Schema 定义，引擎负责解析和渲染 |
| **关注点分离** | Schema（数据）→ Engine（逻辑）→ Component Factory（视图），三层各司其职 |
| **版本隔离** | 模板版本化；运行中的实例绑定创建时的模板快照，模板更新不影响已有实例 |
| **最小依赖** | 审批引擎内建，不依赖外部工作流引擎；通知采用事件驱动，渠道可插拔 |

### 1.3 技术选型

| 层 | 选型 | 理由 |
|------|------|------|
| 前端框架 | React 18+ | 用户指定；组件化模型天然适合 Component Factory 模式 |
| 前端状态 | React Context + useReducer（表单级）；全局状态轻量 Zustand | 表单状态局部化避免全局污染；跨页面状态（用户、通知）用轻量库 |
| 构建工具 | Vite | 快速 HMR，适合设计器实时预览场景 |
| 后端运行时 | Node.js | 与前端共享表单验证逻辑和 Schema 校验 |
| 后端框架 | Express（REST API） | 简单、成熟，符合"不过度工程化"原则 |
| 数据库 | PostgreSQL | JSONB 字段原生支持表单 Schema 和实例数据的灵活存储 |
| 文件存储 | 本地文件系统（MVP）；可切换至对象存储 | 简单起步，预留抽象接口 |
| 实时通知 | Server-Sent Events (SSE) | 审批状态推送；比 WebSocket 更简单，满足单向推送需求 |

---

## 2. 组件设计

### 2.1 表单引擎核心（共享层）

这是整个系统的核心——设计器和填写器共用。

```
FormEngine
├── SchemaParser          # 解析 JSON Schema，生成内部 IR
├── FormStateManager      # 管理 values / errors / visibility / touched / dirty
├── ValidationEngine      # 执行字段级和跨字段验证
├── ConditionEvaluator    # 对 AND/OR 条件 AST 求值，输出 boolean
├── VisibilityEngine      # 基于条件求值计算字段/章节可见性
├── ComponentRegistry     # fieldType → React Component 映射表
├── ComponentFactory      # 根据 fieldType 实例化组件 + 注入 props
└── FormRenderer          # 递归渲染：Section → Fields → SubForm → ...
```

#### 2.1.1 SchemaParser

**职责**：接收原始 JSON Schema，校验其合法性，生成内部中间表示（IR）供引擎消费。

**接口**：
```
输入：RawSchema (JSON)
输出：ParsedSchema { formMeta, sections[], approvalChain, version }
校验规则：Schema JSON 结构合法性、字段类型可识别、审批节点完整性
```

#### 2.1.2 FormStateManager

**职责**：管理单个表单实例的运行时状态。设计器预览和填写器各自实例化独立的状态管理器。

**状态结构**：
```
{
  values:     Record<fieldId, any>       // 当前值
  errors:     Record<fieldId, FieldError[]>  // 验证错误
  visibility: Record<fieldId, boolean>   // 是否可见
  disabled:   Record<fieldId, boolean>   // 是否禁用
  touched:    Record<fieldId, boolean>   // 是否触碰过
  dirty:      boolean                     // 是否有未保存修改
  submitting: boolean                     // 提交中
}
```

**核心方法**：
- `setValue(fieldId, value)` → 更新值 + 触发联动重算 + 触发验证
- `getValue(fieldId)` → 返回当前值
- `setErrors(fieldId, errors[])` → 写入验证错误
- `recalculateVisibility()` → 全量重算可见性
- `reset()` / `restore(snapshot)` → 重置 / 恢复快照

#### 2.1.3 ValidationEngine

**职责**：执行验证规则，返回错误列表。支持同步和异步（如唯一性校验）。

**验证类型与执行时机**：

| 类型 | 触发时机 | 示例 |
|------|---------|------|
| 字段即时验证 | 字段失焦（onBlur） | 必填、长度、范围、正则 |
| 文件验证 | 文件选择时 | 类型、大小、数量 |
| 跨字段验证 | 表单提交时 | 结束日期 > 开始日期 |
| 全量验证 | 表单提交时 | 所有字段规则全部执行 |

**接口**：
```
validateField(fieldSchema, value) → FieldError[]
validateCrossFields(crossFieldRules, allValues) → CrossFieldError[]
validateAll(parsedSchema, values) → AllErrors
```

#### 2.1.4 ConditionEvaluator

**职责**：解析条件 AST 并对当前值求值，返回 boolean。

**条件 AST 结构**：
```
ConditionNode =
  | LeafCondition  { fieldId, operator, value }     // 原子条件
  | AndCondition   { conditions: ConditionNode[] }  // AND 组合
  | OrCondition    { conditions: ConditionNode[] }  // OR 组合
```

**支持的运算符**：`equals`, `notEquals`, `contains`, `notContains`, `greaterThan`, `lessThan`, `isEmpty`, `isNotEmpty`, `in`, `notIn`

**接口**：
```
evaluate(conditionNode, allValues) → boolean
```

#### 2.1.5 ComponentRegistry & ComponentFactory

**职责**：维护 fieldType → Component 的映射；运行时根据字段类型实例化正确的组件，注入标准化 props。

**注册表**：

| fieldType | Component | 说明 |
|-----------|-----------|------|
| `text` | TextInput | 单行文本 |
| `textarea` | TextArea | 多行文本 |
| `number` | NumberInput | 数字输入 |
| `select` | Select | 下拉单选 |
| `radio` | RadioGroup | 单选按钮组 |
| `checkbox` | CheckboxGroup | 多选框组 |
| `date` | DatePicker | 日期选择 |
| `datetime` | DateTimePicker | 日期时间选择 |
| `file` | FileUpload | 文件/图片上传 |
| `subform` | SubForm | 可增删行的表格/子表单（递归渲染） |
| `user-picker` | UserPicker | 人员选择器 |
| `section` | Section | 章节容器（递归渲染内部字段） |
| `info-text` | InfoText | 带图标样式的信息文本（info/warning/danger） |

**组件 Props 契约**（每个字段组件都接收的统一接口）：
```
FieldComponentProps {
  id: string
  label: string
  value: any
  onChange: (value: any) => void
  onBlur: () => void
  error?: FieldError
  disabled: boolean
  placeholder?: string
  options?: SelectOption[]        // select/radio/checkbox
  validation?: ValidationRules
  schema: FieldSchema             // 完整字段配置（组件可按需取用）
}
```

**扩展机制**：新字段类型只需注册到 ComponentRegistry，引擎其余部分无需修改。

#### 2.1.6 FormRenderer

**职责**：递归遍历 ParsedSchema 的 sections 树，对每个节点调用 ComponentFactory 渲染。

**最大嵌套深度**：子表单最多嵌套 2 层（主表单 → 子表单 → 孙表单）。SchemaParser 校验时拒绝超过 2 层的嵌套。子表单内字段支持联动和验证，ConditionEvaluator 和 ValidationEngine 对子表单字段与主表单字段一视同仁。

**渲染逻辑（伪代码）**：
```
function FormRenderer({ schema, stateManager }) {
  return schema.sections
    .filter(section => stateManager.visibility[section.id] !== false)
    .map(section => (
      <SectionContainer section={section}>
        {section.fields
          .filter(field => stateManager.visibility[field.id] !== false)
          .map(field => (
            <ComponentFactory
              key={field.id}
              schema={field}
              value={stateManager.values[field.id]}
              error={stateManager.errors[field.id]}
              onChange={v => stateManager.setValue(field.id, v)}
              onBlur={() => stateManager.validateField(field.id)}
              disabled={stateManager.disabled[field.id]}
            />
          ))
        }
        {/* 子表单递归 */}
        {field.type === 'subform' && <FormRenderer subSchema={field.subSchema} />}
      </SectionContainer>
    ))
}
```

### 2.2 表单设计器（管理端）

```
FormDesigner
├── DesignerShell         # 设计器主框架（三栏布局）
├── TemplateManager       # 模板 CRUD 页面
├── ComponentPalette      # 左侧：可拖拽字段类型列表
├── DesignCanvas          # 中间：画布（DnD 放置目标）
├── PropertyPanel         # 右侧上：选中字段的属性编辑器
├── ConditionEditor       # 可视化条件配置器
├── ApprovalChainConfig   # 审批链配置面板
├── PreviewPanel          # 右侧下：实时预览（嵌入 FormEngine）
├── TemplateExportImport  # 配置导出/导入
└── LockManager           # 签出/签入状态管理
```

#### 2.2.1 拖拽实现

使用 HTML5 Drag and Drop API 或轻量 DnD 库。拖拽流程：

1. **ComponentPalette** 中每种字段类型是一个可拖拽项（`draggable`），携带 `fieldType` 数据
2. **DesignCanvas** 是放置目标，监听 `onDragOver` / `onDrop`
3. Drop 时读取 `fieldType`，创建对应 FieldSchema 的默认配置，插入到画布 Schema 中
4. 触发 Schema 更新 → PreviewPanel 同步渲染

#### 2.2.2 属性面板

根据选中字段的 `fieldType`，动态渲染不同的属性编辑表单：

| 字段类型 | 特有配置项 |
|---------|----------|
| text / textarea | 最小/最大长度 |
| number | 最小/最大值、小数位数 |
| select / radio / checkbox | 选项列表（key-value）、是否多选 |
| date / datetime | 日期范围限制 |
| file | 允许类型、最大大小(MB)、最大数量 |
| subform | 子字段 Schema 定义 |
| user-picker | 单选/多选 |
| info-text | 样式类型（info/warning/danger）、文本内容 |

#### 2.2.3 可视化条件编辑器

**MVP 范围**：仅支持单层 AND 条件（平铺的条件行列表，不支持 OR 和嵌套分组）。完整嵌套 AND/OR AST 编辑器推迟至 Phase 2。详见 [ADR-0006](adr/0006-mvp-condition-editor-scope.md)。

提供逐层构建条件 AST 的 UI：

```
[ 设备类型  ▼ ]  [ 等于  ▼ ]  [ 研发设备  ▼ ]        [× 删除]
[ 是否涉密  ▼ ]  [ 等于  ▼ ]  [ 是  ▼ ]            [× 删除]
                                              [+ 添加条件]
```

所有条件之间为 AND 关系。每个条件行：依赖字段选择器 → 运算符选择器 → 比较值输入 → 删除按钮。

#### 2.2.4 审批链配置

```
审批节点列表（可拖拽排序）：

节点 1： [直属上级 ▼]           [× 删除]
节点 2： [指定角色 ▼] [IT负责人] [× 删除]
节点 3： [指定人员 ▼] [张三]     [× 删除]

[+ 添加审批节点]
```

审批人规则类型：
- **组织架构**：提交人的直属上级 / 部门负责人
- **指定角色**：选择系统中已定义的角色
- **指定人员**：通过人员选择器指定具体人员

#### 2.2.5 预览面板

预览面板内嵌一个**只读模式的 FormEngine 实例**。每次画布 Schema 变更时，预览面板的 FormEngine 重新解析 Schema 并渲染。用户在预览面板中可实际填写和触发验证，等同于填写器中的体验。

### 2.3 表单填写器（用户端）

```
FormFiller
├── FormCenter           # 表单列表（浏览、搜索、分类筛选）
├── FormFillPage         # 表单填写页 = FormEngine + 审批链视图
├── MyDrafts             # 草稿箱
├── MySubmissions        # 我的提交（审批追踪）
├── ApprovalPendingList  # 待审批列表
├── ApprovalView         # 审批操作页 = 表单只读 + 审批操作栏
├── NotificationCenter   # 通知中心
└── DataManagement       # 数据管理（查看、导出、统计）
```

#### 2.3.1 表单填写页布局

```
┌────────────────────────────────────────────────────┐
│  PC 布局                                           │
│  ┌─────────────────────────┐  ┌─────────────────┐  │
│  │                         │  │  审批链状态       │  │
│  │  表单内容区域            │  │  ┌─────────────┐ │  │
│  │  (FormEngine 渲染)      │  │  │ 节点1: 李四  │ │  │
│  │                         │  │  │  状态: 已通过 │ │  │
│  │  ┌───────────────────┐  │  │  │  意见: 同意   │ │  │
│  │  │ 章节1: 基本信息    │  │  │  ├─────────────┤ │  │
│  │  │  设备名称 [____]  │  │  │  │ 节点2: 王五  │ │  │
│  │  │  设备类型 [选择]  │  │  │  │  状态: 审批中 │ │  │
│  │  └───────────────────┘  │  │  └─────────────┘ │  │
│  │  ┌───────────────────┐  │  │                 │  │
│  │  │ 章节2: 详细信息    │  │  │                 │  │
│  │  │  ...              │  │  │                 │  │
│  │  └───────────────────┘  │  │                 │  │
│  │                         │  │                 │  │
│  │  [保存草稿]  [提交]     │  │                 │  │
│  └─────────────────────────┘  └─────────────────┘  │
└────────────────────────────────────────────────────┘

移动端（< 768px）：表单内容在上，审批链在下，单列布局
```

---

## 3. 数据设计

### 3.1 核心实体

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  FormTemplate │──1:N──│  FormInstance    │──1:1──│  ApprovalRecord  │
│              │       │                  │       │                  │
└──────────────┘       └──────────────────┘       └──────────────────┘
       │                        │                         │
       │ 1:1 (配置嵌入)          │ 1:N                     │ 1:N
       ▼                        ▼                         ▼
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ApprovalChain │       │  InstanceField   │       │  ApprovalNode    │
│  (JSON内嵌)  │       │  (JSON内嵌)      │       │  Record          │
└──────────────┘       └──────────────────┘       └──────────────────┘

┌──────────────┐       ┌──────────────────┐
│  User        │──N:M──│  Role            │
│              │       │                  │
└──────────────┘       └──────────────────┘
       │                       │
       │ 1:N                   │ 1:N
       ▼                       ▼
┌──────────────┐       ┌──────────────────┐
│  Draft       │       │  Permission      │
│              │       │  (Role关联)      │
└──────────────┘       └──────────────────┘
```

### 3.2 实体定义

#### FormTemplate（表单模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | VARCHAR(200) | 模板名称 |
| description | TEXT | 描述 |
| category | VARCHAR(100) | 分类 |
| version | VARCHAR(20) | 语义版本号（如 1.0.0） |
| schema | JSONB | 表单结构定义（字段、章节、验证、联动） |
| approval_chain | JSONB | 审批链配置（审批节点列表） |
| status | ENUM | draft / published / archived |
| version | INT | 乐观锁版本号（初始值 1，每次更新 +1） |
| locked_by | UUID? | 签出人 ID（null = 未锁定） |

> **模板不经过审批流程**。设计者可直接发布模板（draft → published）。质量保障通过环境晋升实现（UAT 充分测试 → PROD 迁移），详见需求规格 v1.1 第 3 节。模板状态机仅包含三个状态：draft（编辑中）、published（已发布，用户可填写）、archived（已归档，不可新建实例）。
| locked_at | TIMESTAMP? | 签出时间 |
| created_by | UUID | 创建者 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**schema JSONB 结构**：
```json
{
  "schemaVersion": "1.0.0",
  "sections": [
    {
      "id": "sec-001",
      "title": "基本信息",
      "description": "请填写设备基本信息",
      "collapsible": true,
      "defaultCollapsed": false,
      "visibilityCondition": null,
      "fields": [
        {
          "id": "fld-001",
          "type": "text",
          "label": "设备名称",
          "required": true,
          "placeholder": "请输入设备名称",
          "defaultValue": "",
          "helpText": "",
          "validation": {
            "rules": [
              { "type": "minLength", "value": 2, "message": "至少2个字符" },
              { "type": "maxLength", "value": 50, "message": "不超过50个字符" }
            ]
          },
          "visibilityCondition": null
        },
        {
          "id": "fld-002",
          "type": "select",
          "label": "设备类型",
          "required": true,
          "options": [
            { "label": "办公设备", "value": "office" },
            { "label": "研发设备", "value": "rd" },
            { "label": "生产设备", "value": "production" }
          ],
          "visibilityCondition": null
        }
      ]
    }
  ]
}
```

**approval_chain JSONB 结构**：
```json
{
  "nodes": [
    {
      "id": "node-001",
      "order": 1,
      "label": "直属上级审批",
      "approverRule": {
        "type": "org_structure",
        "relation": "direct_manager"
      }
    },
    {
      "id": "node-002",
      "order": 2,
      "label": "IT部门审批",
      "approverRule": {
        "type": "role",
        "roleId": "role-it-dept"
      }
    }
  ]
}
```

#### FormInstance（表单实例）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| template_id | UUID → FormTemplate | 所属模板 |
| template_snapshot | JSONB | 提交时的模板 Schema 快照（冻结版本） |
| field_values | JSONB | 字段填写值 |
| status | ENUM | draft / submitted / in_approval / approved / rejected / returned / withdrawn |
| current_node_index | INT | 当前审批节点序号（从 0 开始） |
| version | INT | 乐观锁版本号（初始值 1，每次更新 +1） |
| submitted_by | UUID → User | 提交人 |
| submitted_at | TIMESTAMP | 提交时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**field_values JSONB 结构**：
```json
{
  "fld-001": "MacBook Pro 16",
  "fld-002": "office",
  "fld-003": "2026-07-15",
  "fld-file-001": [
    { "name": "合同.pdf", "url": "/files/xxx.pdf", "size": 204800, "type": "application/pdf" }
  ],
  "fld-subform-001": [
    { "fld-sub-name": "设备A", "fld-sub-qty": 2 },
    { "fld-sub-name": "设备B", "fld-sub-qty": 1 }
  ]
}
```

#### ApprovalRecord（审批记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| instance_id | UUID → FormInstance | 表单实例 |
| node_id | VARCHAR | 审批节点 ID（对应 approval_chain 中的节点） |
| node_order | INT | 节点顺序 |
| approver_id | UUID → User | 审批人 |
| action | ENUM | pending / approved / rejected / returned / transferred |
| comment | TEXT | 审批意见 |
| transferred_from | UUID? | 转交来源人 |
| created_at | TIMESTAMP | 任务创建时间 |
| acted_at | TIMESTAMP? | 审批操作时间 |

#### Draft（草稿）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| template_id | UUID → FormTemplate | 所属模板 |
| user_id | UUID → User | 草稿所有者 |
| field_values | JSONB | 已填写值 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 最后保存时间 |
| expires_at | TIMESTAMP | 过期时间（created_at + 2 年） |

**草稿-模板版本不匹配处理**：

打开草稿时比较 `draft.updated_at` 与 `FormTemplate.updated_at`。若模板已更新：
1. 基于 fieldId 映射已有数据到新 Schema（匹配的自动迁移，不匹配的移入 `_orphaned` 对象）
2. 表单顶部显示黄色提示条："表单模板已于 [日期] 更新。您的已有数据已尽力匹配。"
3. `_orphaned` 数据以折叠区域在表单底部展示，用户可查看和手动复制
4. 提交时 `_orphaned` 数据不写入 `field_values`

详见 [ADR-0004](adr/0004-draft-template-version-mismatch.md)。

#### Notification（通知）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| recipient_id | UUID → User | 接收人 |
| type | ENUM | 通知类型（见枚举） |
| title | VARCHAR(200) | 标题 |
| content | TEXT | 内容 |
| ref_type | VARCHAR(50) | 关联对象类型（instance/template） |
| ref_id | UUID | 关联对象 ID |
| is_read | BOOLEAN | 已读 |
| created_at | TIMESTAMP | 创建时间 |

**通知类型枚举**：`instance_submitted`, `instance_approved`, `instance_rejected`, `instance_returned`, `instance_transferred`, `instance_withdrawn`, `instance_completed`

#### 用户与权限

| 实体 | 关键字段 |
|------|---------|
| User | id, name, email, department_id, manager_id（直属上级）, roles[], is_active |
| Role | id, name, description, permissions[] |
| Permission | id, code, name, category |

**预定义权限代码**：

| 代码 | 名称 | 分类 |
|------|------|------|
| `template:create` | 创建模板 | 设计器 |
| `template:edit` | 编辑模板 | 设计器 |
| `template:delete` | 删除模板 | 设计器 |
| `template:publish` | 发布模板 | 设计器 |
| `template:export` | 导出配置 | 设计器 |
| `template:import` | 导入配置 | 设计器 |
| `template:force_unlock` | 强制解锁 | 设计器 |
| `form:fill` | 填写表单 | 填写器 |
| `form:submit` | 提交表单 | 填写器 |
| `form:withdraw` | 撤回提交 | 填写器 |
| `approval:view_pending` | 查看待审批 | 审批 |
| `approval:approve` | 审批同意 | 审批 |
| `approval:reject` | 审批拒绝 | 审批 |
| `approval:return` | 退回修改 | 审批 |
| `approval:transfer` | 转交审批 | 审批 |
| `data:view` | 查看数据 | 数据管理 |
| `data:export` | 导出数据 | 数据管理 |
| `data:view_stats` | 查看统计 | 数据管理 |
| `admin:manage_roles` | 管理角色 | 管理 |
| `admin:manage_users` | 管理用户 | 管理 |

---

## 4. API 设计

### 4.1 模板管理

> 所有 API 路由使用 `/api/v1/v1/` 版本前缀。见 [ADR-0005](adr/0005-schema-api-versioning.md)。

#### POST /api/v1/v1/templates — 创建模板
```
Request:  { name, description, category }
Response: { id, name, ..., status: "draft", locked_by: currentUser, locked_at: now }
Status:   201
```
创建时自动签出给创建者。

#### GET /api/v1/templates — 列表
```
Query:    ?category=&status=&search=&page=&pageSize=
Response: { items: Template[], total, page, pageSize }
```

#### GET /api/v1/templates/:id — 详情
```
Response: { ...Template, schema, approvalChain }
```

#### PUT /api/v1/templates/:id/schema — 保存 Schema
```
Request:  { schema: {...}, approvalChain: {...} }     // 设计器画布变更写入
Response: { updatedAt }
```
需校验当前用户持有签出锁。

#### POST /api/v1/templates/:id/checkout — 签出
```
Response: { locked_by, locked_at } 或 409 (已被他人签出)
```

#### POST /api/v1/templates/:id/checkin — 签入
```
Response: { locked_by: null, locked_at: null }
```

#### POST /api/v1/templates/:id/force-unlock — 强制解锁
```
权限：   admin:manage_roles 或 template:force_unlock
Response: { locked_by: null, locked_at: null }
```

#### POST /api/v1/templates/:id/export — 导出配置
```
Response: application/json 文件下载
Body:     { name, version, schema, approvalChain, exportedAt, exportedBy }
```

#### POST /api/v1/templates/import — 导入配置
```
Request:  multipart/form-data (上传 JSON 文件)
Response: { id, name } (创建的新模板)
校验：    文件中 version 与当前系统兼容
```

### 4.2 表单实例

#### GET /api/v1/forms — 可用表单列表
```
Query:    ?category=&search=
Response: { items: Template[], total }    // 仅已发布的模板
```

#### POST /api/v1/instances — 创建实例（开始填写）
```
Request:  { templateId }
Response: { id, templateId, status: "draft", fieldValues: {} }
```

#### GET /api/v1/instances/:id — 获取实例（填写用）
```
Response: { ...Instance, templateSnapshot: { schema, approvalChain } }
```

#### PUT /api/v1/instances/:id/values — 保存字段值
```
Request:  { fieldValues: {...} }
Response: { updatedAt }
```
用于草稿保存和填写过程中的自动保存。

**自动保存触发策略**（混合）：
- 字段失焦（onBlur）时，若 `dirty === true`，发起自动保存
- 若用户连续输入未失焦，30 秒定时器兜底保存
- 无变更时（`dirty === false`），不发起请求
- 界面显示"草稿已保存 X 秒前"

#### POST /api/v1/instances/:id/submit — 提交
```
Request:  { fieldValues: {...} }
校验：    全量验证 fieldValues vs templateSnapshot.schema
事务：    原子写入 Instance + template_snapshot + ApprovalRecord（见 §6.1）
响应：    201
副作用：  （事务后）创建 Notification + SSE push
```
- 提交时同时检查 `template.status === 'published'`，若模板已下线则拒绝提交
- 前端防重点击（按钮 disabled + loading），后端乐观锁兜底

#### POST /api/v1/instances/:id/withdraw — 撤回
```
Request:  { instanceVersion }    (乐观锁)
校验：    当前审批人尚未处理 + version 匹配
事务：    UPDATE Instance（status → draft） + 清除 ApprovalRecord
响应：    status → "draft"
副作用：  （事务后）通知当前审批人
```
若 version 不匹配 → 409 Conflict，"该提交已被审批人处理，无法撤回"

#### GET /api/v1/instances/my — 我的提交
```
Query:    ?status=&page=&pageSize=
Response: { items, total }
```

#### GET /api/v1/drafts — 我的草稿
```
Response: { items: Draft[], total }
```

#### DELETE /api/v1/drafts/:id — 删除草稿

### 4.3 审批

#### GET /api/v1/approvals/pending — 我的待审批
```
Response: { items: ApprovalRecord[] (含 instance 摘要), total }
```

#### GET /api/v1/approvals/:id — 审批详情
```
Response: { approvalRecord, instance (含完整表单内容和审批链状态) }
```

#### POST /api/v1/approvals/:id/approve — 同意
```
Headers:  Idempotency-Key: <UUID>    (必需，24h 幂等窗口)
Request:  { comment, instanceVersion }  (instanceVersion 用于乐观锁)
副作用：  推进到下一节点 / 完成审批 + 通知提交人
```
若 instanceVersion 不匹配 → 409 Conflict

#### POST /api/v1/approvals/:id/reject — 拒绝
```
Headers:  Idempotency-Key: <UUID>    (必需)
Request:  { comment, instanceVersion }
副作用：  流程终止 + 通知提交人
```

#### POST /api/v1/approvals/:id/return — 退回
```
Headers:  Idempotency-Key: <UUID>    (必需)
Request:  { comment, instanceVersion }
副作用：  instance.status → "returned" + 通知提交人
```

#### POST /api/v1/approvals/:id/transfer — 转交
```
Headers:  Idempotency-Key: <UUID>    (必需)
Request:  { targetUserId, reason, instanceVersion }
副作用：  approver_id 变更为 targetUserId + 通知被转交人
```

### 4.4 数据管理

#### GET /api/v1/data — 数据列表
```
Query:    ?templateId=&status=&submittedBy=&dateFrom=&dateTo=&page=&pageSize=
权限：    data:view（仅返回权限范围内的数据）
```

#### GET /api/v1/data/:instanceId — 数据详情
```
Response: { instance (含 fieldValues + templateSnapshot), approvalRecords[] }
```

#### GET /api/v1/data/export — 导出 Excel
```
Query:    ?templateId=&status=&...  (同筛选参数)
Response: application/vnd.ms-excel 文件流
```

#### GET /api/v1/stats — 统计
```
Query:    ?dateFrom=&dateTo=
Response: { byTemplate: [{ templateId, templateName, count }] }
```

### 4.5 通知

#### GET /api/v1/notifications — 通知列表
```
Query:    ?isRead=&page=&pageSize=
Response: { items, unreadCount, total }
```

#### PUT /api/v1/notifications/:id/read — 标记已读

#### PUT /api/v1/notifications/read-all — 全部已读

### 4.6 用户与权限

#### GET/POST/PUT/DELETE /api/v1/roles — 角色 CRUD

#### GET/POST /api/v1/users/:id/roles — 用户角色管理

### 4.7 文件上传

#### POST /api/v1/files/upload — 上传文件
```
Request:  multipart/form-data
Response: { fileId, url, name, size, type }
```

#### GET /api/v1/files/:id — 下载文件

### 4.8 审批进度实时推送 (SSE)

#### GET /api/v1/sse/instance/:id — 订阅实例审批进度
```
Response: text/event-stream
Event:    approval_update → { nodeOrder, status, approverName, comment }
```

---

## 5. 前端设计

### 5.1 路由结构

前端采用 **5 个路由前缀区域 + 公共页面**（ADR-0010，取代 ADR-0009），权威结构见 `sitemap-form-engine.md`：

```
/                                    # 根路径 → 重定向到权限解锁的第一个导航项（ADR-0010）

/login  /403  /404  /notifications   # 公共页面（不使用共享 Shell）

/designer                            模板设计区域（桌面端）
├── /designer/templates              我的模板
├── /designer/templates/:id          模板详情（只读）
├── /designer/create                 创建模板（入口选择）
│   ├── /designer/create/nl          NL 对话创建
│   └── /designer/create/blank       空白模板创建
├── /designer/edit/:templateId       设计器（三栏工作台）⭐
├── /designer/drafts                 草稿模板
└── /designer/export/:templateId     导出配置

/filler                              表单填写区域（PC + 移动端）
├── /filler/forms                    可用表单
├── /filler/forms/:formId            填写表单 ⭐
├── /filler/forms/:formId/track      提交追踪
├── /filler/forms/:formId/edit       退回修改后重新编辑
├── /filler/drafts                   我的草稿
├── /filler/submissions              我的提交
├── /filler/submissions/:id          提交详情
└── /filler/submissions/:id/resubmit 重新提交

/approver                            审批区域（移动端优先）
├── /approver/pending                待审批 ⭐
├── /approver/pending/:taskId        审批详情
├── /approver/history                已审批
└── /approver/history/:taskId        历史审批详情

/admin                               系统管理区域（桌面端）
├── /admin/users                     用户管理
├── /admin/users/:userId             用户详情
├── /admin/users/:userId/roles       分配角色
├── /admin/roles                     角色管理
├── /admin/roles/create              创建角色
├── /admin/roles/:roleId             编辑角色
├── /admin/roles/:roleId/delete      删除角色
├── /admin/data                      数据管理
├── /admin/data/:submissionId        数据详情
├── /admin/data/export               导出 Excel
├── /admin/statistics                统计看板
├── /admin/templates                 模板管理
└── /admin/templates/:id/force-checkin 强制签入

/ops                                 运维区域（桌面端）
├── /ops/import                      导入配置 ⭐
├── /ops/migrations                  迁移记录
├── /ops/migrations/:id              迁移详情
├── /ops/templates                   PROD 模板查看
└── /ops/templates/:id               模板详情
```

> **语义（ADR-0010）**：`/admin` 归系统管理区域，设计者走 `/designer`，填写者走 `/filler`。前缀仅作**纯路径分组**，无门户语义；所有已登录页面复用同一 `Shell`，导航按用户权限码过滤；根路径重定向到权限解锁的第一个导航项。

### 5.2 组件树（关键页面）

#### 设计器页面

```
<DesignerPage>
  <Header>
    <TemplateBreadcrumb />
    <LockStatusBadge />           {/* "编辑中" / "已锁定 - 张三" */}
    <CheckinButton />
    <ExportButton />
  </Header>
  <DesignerLayout>                {/* 三栏 flex 布局 */}
    <ComponentPalette>            {/* 左侧 240px */}
      <PaletteGroup label="基础控件">
        <DraggableItem type="text" />
        <DraggableItem type="textarea" />
        <DraggableItem type="number" />
        ...
      </PaletteGroup>
      <PaletteGroup label="选择控件">
        <DraggableItem type="select" />
        <DraggableItem type="radio" />
        <DraggableItem type="checkbox" />
      </PaletteGroup>
      <PaletteGroup label="日期控件">...</PaletteGroup>
      <PaletteGroup label="高级控件">
        <DraggableItem type="file" />
        <DraggableItem type="subform" />
        <DraggableItem type="user-picker" />
      </PaletteGroup>
      <PaletteGroup label="展示控件">
        <DraggableItem type="info-text" />
      </PaletteGroup>
    </ComponentPalette>

    <DesignCanvas>                {/* 中间 flex:1 */}
      <SectionContainer>
        <SectionHeader />
        <FieldList>               {/* 可排序 */}
          <FieldItem field={f} /> {/* 可选中、可拖拽排序 */}
        </FieldList>
      </SectionContainer>
      <AddSectionButton />
    </DesignCanvas>

    <RightPanel>                  {/* 右侧 360px，上下分割 */}
      <Tabs>
        <Tab label="属性配置">
          <PropertyPanel field={selectedField}>
            <BasicProps />        {/* 标签、占位提示、默认值 */}
            <ValidationConfig />   {/* 验证规则 */}
            <OptionsEditor />      {/* 选项配置（select/radio/checkbox） */}
            <ConditionTrigger>     {/* 打开条件编辑器 */}
              <ConditionEditor field={selectedField} />
            </ConditionTrigger>
          </PropertyPanel>
        </Tab>
        <Tab label="审批链">
          <ApprovalChainConfig chain={approvalChain} />
        </Tab>
        <Tab label="预览">
          <PreviewPanel schema={currentSchema}>
            <FormEngine schema={currentSchema} readonly={false} />
          </PreviewPanel>
        </Tab>
      </Tabs>
    </RightPanel>
  </DesignerLayout>
</DesignerPage>
```

#### 表单填写页面

```
<FormFillPage>
  <FormHeader>
    <TemplateTitle />
    <DraftStatus />               {/* "草稿已保存 2 分钟前" */}
  </FormHeader>
  <SplitLayout>                   {/* PC: 左右; Mobile: 上下 */}
    <FormContent>
      <FormEngine
        schema={templateSnapshot.schema}
        initialValues={draft?.fieldValues || {}}
        mode="fill"
      />
    </FormContent>
    <ApprovalSidebar>
      <ApprovalTimeline chain={approvalChain} records={approvalRecords} />
    </ApprovalSidebar>
  </SplitLayout>
  <FormFooter>
    <SaveDraftButton />
    <SubmitButton />
  </FormFooter>
</FormFillPage>
```

#### 审批页面

```
<ApprovalPage>
  <SplitLayout>
    <FormContent>                 {/* 只读模式 */}
      <FormEngine
        schema={instance.templateSnapshot.schema}
        initialValues={instance.fieldValues}
        mode="readonly"
      />
    </FormContent>
    <ApprovalSidebar>
      <ApprovalTimeline chain={approvalChain} records={approvalRecords} />
      <ApprovalActions>           {/* 审批操作区 */}
        <CommentInput />
        <ButtonGroup>
          <ApproveButton />
          <RejectButton />
          <ReturnButton />
          <TransferButton />
        </ButtonGroup>
      </ApprovalActions>
    </ApprovalSidebar>
  </SplitLayout>
</ApprovalPage>
```

### 5.3 状态管理策略

| 状态范围 | 方案 | 示例 |
|---------|------|------|
| 单个表单实例 | React Context + useReducer | 表单填写页的 values/errors/visibility |
| 设计器画布 | React Context + useReducer | 当前编辑的 Schema AST |
| 页面级状态 | useState / useSearchParams | 列表筛选、分页 |
| 全局状态 | Zustand store | 当前用户信息、通知未读数、角色权限 |
| 服务端缓存 | 自定义 hook 封装 fetch | 模板列表、实例列表（暂不引入 React Query 等重型方案） |

**表单状态流（核心）**：
```
setValue(fieldId, value)
  → FormStateManager.dispatch({ type: 'SET_VALUE', fieldId, value })
  → reducer 更新 values
  → VisibilityEngine 重算受影响字段的 visibility
  → ValidationEngine 重算受影响字段的 errors
  → 触发联动规则链（如果当前字段是其他字段的依赖项）
```

---

## 6. 后端设计

### 6.1 事务边界

以下操作涉及多次写入，必须保证原子性：

#### 表单提交

```
数据库事务（原子）：
  1. INSERT FormInstance（status: submitted）
  2. INSERT template_snapshot（冻结提交时的 Schema）
  3. INSERT ApprovalRecord（第一节点，含审批人解析）

事务提交成功后（异步）：
  4. INSERT Notification（持久化）
  5. SSE push（实时推送，at-most-once）
```

- **审批人解析在事务内执行**。若解析失败（直属上级不存在、角色无人匹配），**整个事务回滚**，提交失败，返回错误"审批流程配置异常，请联系管理员"。
- Notification 持久化失败不阻塞提交——通知中心可通过查询 Instance/ApprovalRecord 状态反推遗漏事件。

#### 审批操作

```
数据库事务（原子）：
  1. UPDATE FormInstance（status / current_node_index，带 version 乐观锁）
  2. UPDATE ApprovalRecord（action / comment）
  3. INSERT ApprovalRecord（下一节点，如有）

事务提交成功后（异步）：
  4. INSERT Notification
  5. SSE push
```

- 乐观锁冲突（0 rows affected）→ 事务回滚 → 返回 409 Conflict。
- 需要 `Idempotency-Key` Header（见 API 设计）。

#### 模板发布

```
数据库事务（原子）：
  1. UPDATE FormTemplate（status → published）

事务提交成功后（异步）：
  2. 清理 Schema 缓存
```

---

### 6.6 组织架构数据源（OrgDataSource）

系统不维护部门树和上下级关系。通过 `OrgDataSource` 接口抽象，对用户数据和审批人解析提供统一的数据访问。

```
interface OrgDataSource {
  getUser(id: string): Promise<User>;
  searchUsers(query: string): Promise<User[]>;       // 按姓名/工号模糊搜索
  getUserManager(userId: string): Promise<User>;     // 直属上级
  getUsersByDepartment(departmentId: string): Promise<User[]>;
}
```

- **MVP 实现**：从静态 JSON 文件导入 User 数据（含 `manager_id`、`department_id`）
- **UserPicker 组件**通过 `OrgDataSource.searchUsers()` 获取数据
- **审批人解析**通过 `OrgDataSource.getUserManager()` 解析 org_structure 规则
- **后续可替换实现**：企业微信 API、飞书 API、LDAP 等
- 表单引擎**只读消费**组织架构数据，不修改用户数据

---

### 6.2 服务划分

| 服务 | 职责 | 关键逻辑 |
|------|------|---------|
| **TemplateService** | 模板 CRUD、签出/签入、配置导入导出 | 锁定校验、版本兼容性检查 |
| **InstanceService** | 实例创建、字段值保存、草稿管理、提交/撤回 | 提交时快照模板、全量验证 |
| **ApprovalService** | 审批节点解析、审批操作、状态流转 | **状态机**、审批人动态解析 |
| **NotificationService** | 事件监听、通知生成、消息投递 | 事件 → 通知映射、SSE 推送 |
| **DataService** | 数据查询、Excel 导出、统计 | 权限过滤、大数据量导出 |
| **FileService** | 文件上传、存储、下载 | 类型/大小校验、存储抽象 |
| **PermissionService** | 角色权限校验 | 权限码匹配、数据范围过滤 |

### 6.3 审批状态机

```
                    ┌─────────┐
                    │  DRAFT  │
                    └────┬────┘
                         │ submit()
                         ▼
                    ┌──────────┐
              ┌─────│SUBMITTED │─────┐
              │     └────┬─────┘     │
              │          │ approve() │ reject()
              │          ▼           ▼
              │     ┌──────────┐  ┌──────────┐
              │     │IN_APPROVAL│  │ REJECTED │ (终态)
              │     └────┬─────┘  └──────────┘
              │          │
              │          ├── approve() && isLast → ┌───────────┐
              │          │                         │ APPROVED   │ (终态)
              │          ├── reject()              └───────────┘
              │          │          → REJECTED
              │          ├── return() → RETURNED ──→ (提交人修改后重新 submit → SUBMITTED)
              │          ├── transfer() → 不改变状态，仅更换审批人
              │          └── withdraw() (提交人操作) → DRAFT
              │
              └── withdraw() (审批人未处理) → DRAFT
```

### 6.4 审批人动态解析

```
function resolveApprover(rule, submitter):
  switch rule.type:
    case "org_structure":
      return getUserByRelation(submitter.id, rule.relation)
      // relation: "direct_manager" → submitter.manager_id

    case "role":
      return getUsersByRole(rule.roleId)
      // 返回该角色下所有用户；多人时选择其一（或并行审批，当前为串行）

    case "specific":
      return rule.userId
      // 直接指定用户

解析失败处理：
- 无法解析直属上级 → 标记为异常，通知管理员
- 指定角色下无用户 → 标记为异常，暂停流转
```

### 6.5 通知事件流

**MVP 渠道**：仅站内通知（SSE 实时推送 + 通知中心持久化）。通知服务投递层使用**渠道适配器模式**——`InAppChannel`（MVP 默认），后续可插拔增加 `EmailChannel`、`WeChatChannel` 等，不影响核心逻辑。

```
事件源                        通知生成                    投递
──────                       ────────                    ────
InstanceService.submit()  →  NOTIFICATION_EVENT        → NotificationService
  emit('instance.submitted')   → 匹配事件-通知映射         → INSERT notification
                               → 确定接收人                 → SSE push (在线用户)
                                                          → [未来] EmailChannel.send()
                                                          → [未来] WeChatChannel.send()

ApprovalService.approve() →
  emit('instance.approved')
  emit('instance.completed')  // 如果是最后一级
```

**事件-通知映射表**：

| 事件 | 通知类型 | 接收人 |
|------|---------|--------|
| `instance.submitted` | `instance_submitted` | 第一个审批节点解析出的审批人 |
| `instance.approved` | `instance_approved` | 提交人 |
| `instance.rejected` | `instance_rejected` | 提交人 |
| `instance.returned` | `instance_returned` | 提交人 |
| `instance.transferred` | `instance_transferred` | 被转交人 |
| `instance.withdrawn` | `instance_withdrawn` | 当前审批人 |
| `instance.completed` | `instance_completed` | 提交人 |

---

## 7. 安全考虑

### 7.1 认证与授权

| 维度 | 措施 |
|------|------|
| **认证** | JWT Bearer Token；httpOnly, Secure, SameSite=Strict Cookie 存储；滑动过期策略，活跃用户自动续期；登录态 7 天 |
| **授权** | 每个 API 端点通过中间件校验权限码；权限码与角色关联（非硬编码） |
| **数据隔离** | 数据查询时强制注入用户范围过滤——填写者仅可见己、审批人仅可见链路数据 |
| **签出锁** | 服务端校验签出锁归属；只有锁持有者和管理员可编辑 |
| **权限刷新** | `/api/v1/auth/refresh` 端点，滑动过期 |

### 7.2 CSRF 防护

- Token 存储方案：**httpOnly Cookie + CSRF Token Header**
- 登录时服务端 Set-Cookie（`httpOnly`, `Secure`, `SameSite=Strict`）
- 所有非 GET 请求携带 `X-CSRF-Token` Header（值从独立 Cookie 读取，该 Cookie 非 httpOnly）
- 服务端中间件校验所有 mutating 请求的 CSRF Token

### 7.3 速率限制

以下高风险接口实施速率限制（Express 中间件 + 内存计数）：

| 接口 | 限制 | 理由 |
|------|------|------|
| `POST /api/v1/auth/login` | 5 次/分钟/IP | 防暴力破解 |
| `POST /api/v1/files/upload` | 20 次/分钟/用户 | 防存储滥用 |
| `POST /api/v1/instances/:id/submit` | 10 次/分钟/用户 | 防重复提交攻击 |
| `GET /api/v1/data/export` | 5 次/小时/用户 | 防 DoS |

### 7.4 输入与文件安全

| 维度 | 措施 |
|------|------|
| **输入校验** | 服务端对所有提交的 fieldValues 按模板 Schema 全量验证（不信任前端校验） |
| **文件安全** | 上传文件校验 MIME 类型（不依赖扩展名）；文件大小在前后端均拦截 |
| **路径穿越防护** | 文件名消毒：丢弃原始路径部分，仅保留 basename，前加 UUID 前缀。存储前验证绝对路径在 `upload_root` 内。存储路径格式：`{upload_dir}/{uuid}_{sanitized_basename}` |
| **XSS 防护** | 字段 label 和选项由设计者配置，渲染时转义处理 |
| **审计日志** | 关键操作记录：模板创建/修改/发布、实例提交/撤回、审批操作、权限变更、数据导出 |
| **配置注入** | 导入的 JSON 配置文件需校验结构合法性，防止恶意注入 |
| **CORS** | 显式配置允许的来源域名，不依赖 `*` 通配符 |

---

## 8. 性能考虑

| 维度 | 措施 |
|------|------|
| **Schema 解析缓存** | 模板 Schema 解析结果缓存在服务端内存（发布时预解析），填写时直接取用 |
| **表单渲染** | FormEngine 采用增量更新——单字段值变更仅重渲染受影响字段，非全表单 |
| **条件重算** | VisibilityEngine 仅重算依赖链上的字段（构建依赖图），非全量遍历 |
| **列表分页** | 所有列表接口默认分页，pageSize 上限 100 |
| **Excel 导出** | 超过 1000 条时异步生成，完成后通知下载（避免请求超时） |
| **文件上传** | 前端分片上传大文件（> 5MB），支持断点续传 |
| **JSONB 索引** | PostgreSQL 对 template_snapshot 和 field_values 的常用查询路径建立 GIN 索引 |
| **SSE 连接** | 按实例建立 SSE 连接，断开自动重连；连接数上限监控 |

---

## 9. 测试策略

### 9.1 测试金字塔

```
         ┌──────┐
         │ E2E  │  关键用户旅程（设计→填写→审批全链路）
         └──────┘
       ┌──────────┐
       │ 集成测试  │  API 端点 + 数据库交互 + 审批状态机
       └──────────┘
    ┌─────────────────┐
    │    单元测试      │  FormEngine 各模块、审批引擎、验证引擎、条件求值器
    └─────────────────┘
```

### 9.2 关键测试场景

#### 单元测试（重点覆盖）

| 模块 | 测试点 |
|------|--------|
| SchemaParser | 合法 Schema 解析正确；非法 Schema 抛出明确错误（缺少必填字段、fieldType 未知、审批链为空） |
| ValidationEngine | 每种验证规则独立验证；组合规则正确执行；跨字段验证正确比较 |
| ConditionEvaluator | 原子条件正确求值；AND/OR 嵌套正确短路；运算符覆盖全 |
| VisibilityEngine | 单字段联动；章节级联动；多字段依赖链；条件变更触发重算 |
| FormStateManager | setValue 触发联动+验证；touched 追踪；dirty 标记 |
| ApprovalStateMachine | 合法转换执行；非法转换拒绝（如已审批后撤回） |
| ApprovalResolver | 三种规则类型正确解析；解析失败返回 null + 标记异常 |

#### 集成测试

| 场景 | 验证点 |
|------|--------|
| 创建模板 → 签出 → 编辑 Schema → 签入 → 导出 → 导入 | 全流程数据一致性 |
| 提交表单 → 全量验证 → 审批流转（多级通过） | 状态正确转换、通知发送 |
| 提交 → 拒绝 → 流程终止 | 终态正确 |
| 提交 → 退回 → 重新提交 → 重新审批 | 从第一个节点开始 |
| 提交 → 转交 → 新审批人操作 | 审批人正确替换 |
| 提交 → 撤回 | 状态回到草稿 |
| 草稿保存 → 恢复 → 继续填写 → 提交 | 数据不丢失 |
| 并发签出 | 第二人拒绝 |
| 模板发布后修改 → 已有实例不受影响 | templateSnapshot 隔离 |

#### E2E（端到端用户旅程）

```
旅程 1：零代码用户创建并发布表单
  登录设计器 → 新建模板 → 拖拽字段 → 配置属性 → 配置联动 →
  配置审批链 → 预览 → 签入 → 导出

旅程 2：员工填写并追踪审批
  登录填写器 → 浏览表单列表 → 打开表单 → 填写 →
  保存草稿 → 恢复草稿 → 提交 → 查看审批进度

旅程 3：审批人审批流转
  收到通知 → 查看待审批列表 → 打开审批 → 填写意见 →
  同意 → 流转至下一级 → 最终完成

旅程 4：移动端填写
  手机浏览器打开 → 表单适配单列 → 填写 → 提交
```

---

## 10. 跨领域架构决策

以下决策在 MVP 阶段确定，均为企业级内部系统的标准选择。如有任一决策需要变更，请以 ADR 形式记录。

| 编号 | 决策 | 选择 | 简要原因 |
|------|------|------|---------|
| MD-01 | 多租户模型 | **单租户**（不加 `tenant_id`） | 企业内部系统，非 SaaS |
| MD-02 | 国际化 | **仅中文**（MVP） | 内部系统，暂无多语言需求 |
| MD-03 | 可观测性 | **结构化日志**（JSON 输出）+ 请求级 traceId | 标准做法 |
| MD-04 | 部署架构 | **Docker Compose**（Node + PostgreSQL + Nginx） | 环境一致、可复现 |
| MD-05 | 后台任务 | **进程内事件队列**（MVP） | 日均 100 提交，后续可换 Bull/Redis |
| MD-06 | 数据库迁移 | **Knex** | 迁移脚本可版本化 |
| MD-07 | JWT 刷新策略 | **滑动过期** + `/api/v1/auth/refresh` | 活跃用户自动续期 |
| MD-08 | API 错误格式 | 统一 `{ error: { code, message, details? } }` | 全 API 一致性 |
| MD-09 | 分页标准 | **偏移量式**（`?page=&pageSize=`），上限 100 | 设计已隐含，显式标准化 |
| MD-10 | 环境配置 | **环境变量 + dotenv**（`.env.{NODE_ENV}`） | 标准做法 |

### 错误码清单（新增）

| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| `VALIDATION_ERROR` | 422 | 字段值校验失败 |
| `VERSION_CONFLICT` | 409 | 乐观锁冲突（并发操作） |
| `IDEMPOTENCY_CONFLICT` | 409 | 幂等键重复（不同请求体） |
| `TEMPLATE_LOCKED` | 409 | 模板已被他人签出 |
| `TEMPLATE_NOT_PUBLISHED` | 400 | 模板未发布或已下线 |
| `APPROVAL_NOT_PENDING` | 400 | 审批已处理，无法操作 |
| `APPROVER_RESOLUTION_FAILED` | 500 | 审批人解析失败 |
| `SCHEMA_VERSION_UNKNOWN` | 400 | Schema 版本不被当前引擎支持 |
| `RATE_LIMITED` | 429 | 触发速率限制 |

---

## 11. 配置驱动的核心闭环

总结系统的核心运作原理——**一个 Schema，两个消费者**：

```
                    ┌─────────────┐
                    │  表单设计器   │
                    │ (Schema 生产者)│
                    └──────┬──────┘
                           │ 输出
                           ▼
                    ┌─────────────┐
                    │  JSON Schema │  ← 表单的完整定义
                    │  + 审批链配置 │     （结构 + 验证 + 联动 + 流程）
                    └──────┬──────┘
                           │ 消费
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ 表单引擎  │  │ 审批引擎  │  │ 数据管理  │
      │ (渲染UI) │  │ (状态机)  │  │ (查看统计) │
      └──────────┘  └──────────┘  └──────────┘
```

Schema 是整个系统的单一事实来源。引擎不关心业务内容，只负责忠实地将 Schema 翻译为用户界面和行为。

---

> 📌 **下一步**：设计规格完成后，可通过 `/design-reviewer` 进行架构评审，识别隐藏风险和缺失决策。
