import { useState } from "react";
import type {
  ApprovalChain,
  ApprovalNode,
  ApproverRule,
  FieldSchema,
  SectionSchema,
  SelectOption,
  ValidationRuleType,
} from "form-engine-core";
import { findField, removeRule, setRule, type DesignerSchema } from "./schemaModel";
import { IconButton, Input } from "../components";
import { CloseIcon, DownIcon, PlusIcon, TrashIcon, UpIcon } from "./icons";
import { StructureTree } from "./StructureTree";

type TabKey = "tree" | "props" | "chain";

/** The selected canvas/tree node: a field (with its owning section) or a section. */
export type PanelSelection =
  | { kind: "field"; sectionId: string; field: FieldSchema }
  | { kind: "section"; section: SectionSchema }
  | null;

/**
 * Resolve a selected canvas/structure-tree id into the panel's selection model.
 * A field id wins; a section id resolves to a section; anything else is null.
 * Pure (no DOM) so the id→selection wiring is unit-testable.
 */
export function resolveSelected(
  schema: DesignerSchema,
  selectedId: string | null,
): PanelSelection {
  if (!selectedId) return null;
  const hit = findField(schema, selectedId);
  if (hit) return { kind: "field", sectionId: hit.sectionId, field: hit.field };
  const section = schema.sections.find((s) => s.id === selectedId);
  return section ? { kind: "section", section } : null;
}

export interface PropertyPanelProps {
  schema: DesignerSchema;
  selectedId: string | null;
  selected: PanelSelection;
  chain: ApprovalChain;
  onChangeField: (
    sectionId: string,
    fieldId: string,
    patch: Partial<FieldSchema>,
  ) => void;
  onChangeSection: (sectionId: string, patch: Partial<SectionSchema>) => void;
  onSelect: (id: string | null) => void;
  // Structure tree
  onAddFieldToSection: (sectionId: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onMoveField: (sectionId: string, fieldId: string, delta: -1 | 1) => void;
  onReorderField: (sectionId: string, fieldId: string, targetIndex: number) => void;
  // Approval chain
  onAddChainNode: () => void;
  onRemoveChainNode: (id: string) => void;
  onMoveChainNode: (id: string, delta: -1 | 1) => void;
  onChangeChainNode: (id: string, patch: Partial<ApprovalNode>) => void;
}

/**
 * Right panel — 结构树 / 属性 / 审批链 (prototype's side-panel tabs). The
 * center canvas is the live preview, so there is no separate 预览 tab here.
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = (props) => {
  const [tab, setTab] = useState<TabKey>("tree");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "tree", label: "结构树" },
    { key: "props", label: "属性" },
    { key: "chain", label: "审批链" },
  ];

  return (
    <aside className="side-panel">
      <div className="side-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "side-tab active" : "side-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="side-body">
        {tab === "tree" && (
          <div className="side-pane active">
            <StructureTree
              schema={props.schema}
              selectedId={props.selectedId}
              onSelect={props.onSelect}
              onAddFieldToSection={props.onAddFieldToSection}
              onRemoveSection={props.onRemoveSection}
              onRemoveField={props.onRemoveField}
              onMoveField={props.onMoveField}
              onReorderField={props.onReorderField}
            />
          </div>
        )}
        {tab === "props" && (
          <div className="side-pane active">
            <PropsTab
              selected={props.selected}
              onChangeField={props.onChangeField}
              onChangeSection={props.onChangeSection}
            />
          </div>
        )}
        {tab === "chain" && (
          <div className="side-pane active">
            <ChainTab
              chain={props.chain}
              onAdd={props.onAddChainNode}
              onRemove={props.onRemoveChainNode}
              onMove={props.onMoveChainNode}
              onChange={props.onChangeChainNode}
            />
          </div>
        )}
      </div>
    </aside>
  );
};

// ── 属性 tab ────────────────────────────────────────────────────────────────

function PropsTab({
  selected,
  onChangeField,
  onChangeSection,
}: {
  selected: PropertyPanelProps["selected"];
  onChangeField: PropertyPanelProps["onChangeField"];
  onChangeSection: PropertyPanelProps["onChangeSection"];
}) {
  if (!selected) {
    return (
      <div className="props">
        <div className="props-empty">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 9h6M9 13h6M9 17h3" />
          </svg>
          <div>
            在画布或结构树中<b>选择一个字段或章节</b>以编辑属性
          </div>
        </div>
      </div>
    );
  }

  if (selected.kind === "section") {
    return <SectionEditor section={selected.section} onChangeSection={onChangeSection} />;
  }

  const { sectionId, field } = selected;
  const update = (patch: Partial<FieldSchema>) =>
    onChangeField(sectionId, field.id, patch);

  const showPlaceholder = ["text", "textarea", "number"].includes(field.type);
  const showDefault = ["text", "textarea", "number"].includes(field.type);
  const showHelp = ["text", "textarea", "number", "user-picker"].includes(field.type);

  return (
    <div className="props">
      <div className="prop-group-title">基本</div>

      <div className="prop-row">
        <label className="label">字段标签</label>
        <Input
          inputClassName="prop-input"
          value={field.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>

      {showPlaceholder && (
        <div className="prop-row">
          <label className="label">占位提示</label>
          <Input
            inputClassName="prop-input"
            value={field.placeholder ?? ""}
            onChange={(e) => update({ placeholder: e.target.value })}
          />
        </div>
      )}

      {showDefault && (
        <div className="prop-row">
          <label className="label">默认值</label>
          <Input
            inputClassName="prop-input"
            value={field.defaultValue == null ? "" : String(field.defaultValue)}
            onChange={(e) => update({ defaultValue: e.target.value })}
          />
        </div>
      )}

      {showHelp && (
        <div className="prop-row">
          <label className="label">帮助文本</label>
          <textarea
            className="textarea"
            value={field.helpText ?? ""}
            onChange={(e) => update({ helpText: e.target.value })}
          />
        </div>
      )}

      <SwitchRow
        label="必填"
        hint="填写者必须填写此字段"
        checked={field.required}
        ariaLabel="必填"
        onChange={(v) => update({ required: v })}
      />

      {(field.type === "select" ||
        field.type === "radio" ||
        field.type === "checkbox") && (
        <OptionsEditor options={field.options ?? []} onChange={update} />
      )}

      {(field.type === "text" ||
        field.type === "textarea" ||
        field.type === "number") && (
        <ValidationEditor field={field} onChange={update} />
      )}

      {field.type === "file" && <FileEditor field={field} onChange={update} />}
    </div>
  );
}

/** A labelled on/off switch row (ps-label + ps-hint + switch/track). */
function SwitchRow({
  label,
  hint,
  checked,
  ariaLabel,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="prop-row prop-switch">
      <div>
        <div className="ps-label">{label}</div>
        <div className="ps-hint">{hint}</div>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          aria-label={ariaLabel}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="track" />
      </label>
    </div>
  );
}

// ── 章节属性 ──────────────────────────────────────────────────────────────

function SectionEditor({
  section,
  onChangeSection,
}: {
  section: SectionSchema;
  onChangeSection: PropertyPanelProps["onChangeSection"];
}) {
  const update = (patch: Partial<SectionSchema>) =>
    onChangeSection(section.id, patch);

  return (
    <div className="props">
      <div className="prop-group-title">基本</div>

      <div className="prop-row">
        <label className="label">章节标题</label>
        <Input
          inputClassName="prop-input"
          aria-label="章节标题"
          value={section.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </div>

      <div className="prop-row">
        <label className="label">章节描述</label>
        <textarea
          className="textarea"
          aria-label="章节描述"
          value={section.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
        />
      </div>

      <SwitchRow
        label="可折叠"
        hint="允许填写者折叠 / 展开此章节"
        checked={section.collapsible ?? false}
        ariaLabel="可折叠"
        onChange={(v) =>
          // Turning collapse off also clears any remembered default-collapsed
          // state, so re-enabling later starts from an explicit off.
          update({ collapsible: v, defaultCollapsed: v ? section.defaultCollapsed : false })
        }
      />

      {(section.collapsible ?? false) && (
        <SwitchRow
          label="默认折叠"
          hint="填写者打开表单时章节默认收起"
          checked={section.defaultCollapsed ?? false}
          ariaLabel="默认折叠"
          onChange={(v) => update({ defaultCollapsed: v })}
        />
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: SelectOption[];
  onChange: (patch: Partial<FieldSchema>) => void;
}) {
  const setLabel = (index: number, label: string) =>
    onChange({
      options: options.map((o, i) => (i === index ? { ...o, label } : o)),
    });
  const remove = (index: number) =>
    onChange({ options: options.filter((_, i) => i !== index) });
  const add = () =>
    onChange({
      options: [
        ...options,
        { label: "新选项", value: `option${options.length + 1}` },
      ],
    });

  return (
    <>
      <div className="prop-group-title">选项</div>
      {options.map((option, index) => (
        <div className="prop-row flex gap-8" key={index}>
          <Input
            inputClassName="prop-input"
            aria-label={`选项${index + 1}`}
            value={option.label}
            onChange={(e) => setLabel(index, e.target.value)}
          />
          <IconButton variant="danger" label="删除选项" onClick={() => remove(index)}>
            <CloseIcon />
          </IconButton>
        </div>
      ))}
      <button type="button" className="chip-add" onClick={add}>
        <PlusIcon />
        添加选项
      </button>
    </>
  );
}

function ValidationEditor({
  field,
  onChange,
}: {
  field: FieldSchema;
  onChange: (patch: Partial<FieldSchema>) => void;
}) {
  const isNumber = field.type === "number";

  const ruleValue = (type: ValidationRuleType): string => {
    const rule = field.validation?.rules.find((r) => r.type === type);
    return rule?.value == null ? "" : String(rule.value);
  };
  const ruleMessage = (): string => {
    const rule = field.validation?.rules.find((r) => r.type === "regex");
    return rule?.message ?? "";
  };

  const setNumberRule = (type: ValidationRuleType, raw: string) => {
    if (raw === "") {
      onChange({ validation: removeRule(field, type).validation });
      return;
    }
    onChange({ validation: setRule(field, type, { value: Number(raw) }).validation });
  };
  const setRegex = (patch: { value?: string; message?: string }) => {
    const next = setRule(field, "regex", patch);
    onChange({ validation: next.validation });
  };

  return (
    <>
      <div className="prop-group-title">验证</div>

      {isNumber ? (
        <div className="prop-row">
          <label className="label">数值范围</label>
          <div className="field-group">
            <Input
              inputClassName="prop-input"
              type="number"
              placeholder="最小"
              value={ruleValue("min")}
              onChange={(e) => setNumberRule("min", e.target.value)}
            />
            <Input
              inputClassName="prop-input"
              type="number"
              placeholder="最大"
              value={ruleValue("max")}
              onChange={(e) => setNumberRule("max", e.target.value)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="prop-row">
            <label className="label">长度限制</label>
            <div className="field-group">
              <Input
                inputClassName="prop-input"
                type="number"
                placeholder="最小"
                value={ruleValue("minLength")}
                onChange={(e) => setNumberRule("minLength", e.target.value)}
              />
              <Input
                inputClassName="prop-input"
                type="number"
                placeholder="最大"
                value={ruleValue("maxLength")}
                onChange={(e) => setNumberRule("maxLength", e.target.value)}
              />
            </div>
          </div>
          <div className="prop-row">
            <label className="label">正则表达式</label>
            <Input
              inputClassName="prop-input mono"
              placeholder="例如 ^1\\d{10}$"
              value={ruleValue("regex")}
              onChange={(e) => setRegex({ value: e.target.value })}
            />
            <div className="hint">
              不匹配时提示：
              <Input
                inputClassName="prop-input"
                style={{ marginTop: 6 }}
                placeholder="自定义提示（可选）"
                value={ruleMessage()}
                onChange={(e) => setRegex({ message: e.target.value })}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FileEditor({
  field,
  onChange,
}: {
  field: FieldSchema;
  onChange: (patch: Partial<FieldSchema>) => void;
}) {
  const allowTypes = field.allowTypes ?? [];
  const typeLabel =
    allowTypes.length === 0 || allowTypes.includes("pdf")
      ? "图片/文档"
      : allowTypes.includes("png") && allowTypes.includes("doc")
        ? "图片/文档"
        : allowTypes.includes("png")
          ? "仅图片"
          : "仅文档";

  return (
    <>
      <div className="prop-group-title">文件限制</div>
      <div className="prop-row">
        <label className="label">允许类型</label>
        <select
          className="select"
          value={typeLabel}
          onChange={(e) => {
            const v = e.target.value;
            const map: Record<string, string[]> = {
              "图片/文档": ["pdf", "png", "jpg", "doc", "docx"],
              "仅图片": ["png", "jpg"],
              "仅文档": ["pdf", "doc", "docx"],
            };
            onChange({ allowTypes: map[v] });
          }}
        >
          <option>图片/文档</option>
          <option>仅图片</option>
          <option>仅文档</option>
        </select>
      </div>
      <div className="prop-row">
        <label className="label">最大大小</label>
        <select
          className="select"
          value={`${field.maxSizeMB ?? 10}MB`}
          onChange={(e) => onChange({ maxSizeMB: Number(e.target.value.replace("MB", "")) })}
        >
          {["5MB", "10MB", "20MB", "50MB"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
    </>
  );
}

// ── 审批链 tab ──────────────────────────────────────────────────────────────

const RULE_TYPE_OPTIONS: { key: ApproverRule["type"]; label: string }[] = [
  { key: "org_structure", label: "组织架构" },
  { key: "role", label: "指定角色" },
  { key: "specific", label: "指定人员" },
];

const RULE_VALUE_OPTIONS: Record<ApproverRule["type"], { key: string; label: string }[]> = {
  org_structure: [
    { key: "direct_manager", label: "直属上级" },
    { key: "department_manager", label: "部门负责人" },
  ],
  role: [
    { key: "it-manager", label: "IT 负责人" },
    { key: "finance", label: "财务审批人" },
    { key: "hr", label: "HR 负责人" },
  ],
  specific: [
    { key: "zhangsan", label: "张三" },
    { key: "lisi", label: "李四" },
  ],
};

function ruleValueKey(rule: ApproverRule): string {
  if (rule.type === "org_structure") return rule.relation;
  if (rule.type === "role") return rule.roleId;
  return rule.userId;
}

function ChainTab({
  chain,
  onAdd,
  onRemove,
  onMove,
  onChange,
}: {
  chain: ApprovalChain;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onChange: (id: string, patch: Partial<ApprovalNode>) => void;
}) {
  const nodes = chain.nodes;
  return (
    <div className="chain">
      {nodes.map((node, i) => (
        <div className="chain-node" key={node.id}>
          <div className="cn-rail">
            <span className="cn-dot">{i + 1}</span>
            <span className="cn-line" />
          </div>
          <div className="chain-card">
            <div className="cc-head">
              <span className="cc-title">{node.label ?? "审批节点"}</span>
              <span className="cc-tools">
                <IconButton
                  size="sm"
                  label="上移"
                  disabled={i === 0}
                  onClick={() => onMove(node.id, -1)}
                >
                  <UpIcon />
                </IconButton>
                <IconButton
                  size="sm"
                  label="下移"
                  disabled={i === nodes.length - 1}
                  onClick={() => onMove(node.id, 1)}
                >
                  <DownIcon />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="danger"
                  label="删除节点"
                  onClick={() => onRemove(node.id)}
                >
                  <TrashIcon />
                </IconButton>
              </span>
            </div>
            <div className="rule-select-row">
              <select
                className="select"
                value={node.approverRule.type}
                onChange={(e) => {
                  const type = e.target.value as ApproverRule["type"];
                  const value = RULE_VALUE_OPTIONS[type][0].key;
                  onChange(node.id, {
                    approverRule: buildRule(type, value),
                  });
                }}
              >
                {RULE_TYPE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={ruleValueKey(node.approverRule)}
                onChange={(e) =>
                  onChange(node.id, {
                    approverRule: buildRule(node.approverRule.type, e.target.value),
                  })
                }
              >
                {RULE_VALUE_OPTIONS[node.approverRule.type].map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="chain-add" onClick={onAdd}>
        <PlusIcon />
        添加审批节点
      </button>
      <div className="xsmall" style={{ color: "var(--text-3)", marginTop: 12, lineHeight: 1.7 }}>
        审批人规则将在表单提交时动态解析（组织架构 / 指定角色 / 指定人员）。节点按顺序依次审批。
      </div>
    </div>
  );
}

function buildRule(type: ApproverRule["type"], value: string): ApproverRule {
  if (type === "org_structure") {
    return {
      type,
      relation: value as "direct_manager" | "department_manager",
    };
  }
  if (type === "role") return { type, roleId: value };
  return { type, userId: value };
}
