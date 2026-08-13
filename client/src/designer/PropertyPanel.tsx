import { useState } from "react";
import type {
  ApprovalChain,
  ApprovalNode,
  FieldSchema,
  InfoTextStyle,
  SelectOption,
  ValidationRuleType,
} from "form-engine-core";
import { Form } from "../form/Form";
import { removeRule, setRule, type DesignerSchema } from "./schemaModel";

type TabKey = "props" | "approval" | "preview";

export interface PropertyPanelProps {
  schema: DesignerSchema;
  /** The selected field (with its owning section) or null when nothing is selected. */
  selected: { sectionId: string; field: FieldSchema } | null;
  approvalChain?: ApprovalChain;
  onChangeField: (
    sectionId: string,
    fieldId: string,
    patch: Partial<FieldSchema>,
  ) => void;
}

/**
 * Right panel — three tabs: 属性 (dynamic field config by fieldType), 审批链
 * (read-only approval chain for the MVP, which publishes without approval), and
 * 预览 (read-only FormEngine rendered from the current schema).
 */
export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  schema,
  selected,
  approvalChain,
  onChangeField,
}) => {
  const [tab, setTab] = useState<TabKey>("props");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "props", label: "属性" },
    { key: "approval", label: "审批链" },
    { key: "preview", label: "预览" },
  ];

  return (
    <div className="panel">
      <div className="panel-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "panel-tab active" : "panel-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === "props" && (
          <PropsTab selected={selected} onChangeField={onChangeField} />
        )}
        {tab === "approval" && <ApprovalTab approvalChain={approvalChain} />}
        {tab === "preview" && <PreviewTab schema={schema} />}
      </div>
    </div>
  );
};

// ── 属性 tab ────────────────────────────────────────────────────────────────

function PropsTab({
  selected,
  onChangeField,
}: {
  selected: PropertyPanelProps["selected"];
  onChangeField: PropertyPanelProps["onChangeField"];
}) {
  if (!selected) {
    return <p className="panel-empty">请选择一个字段以编辑属性</p>;
  }
  const { sectionId, field } = selected;
  const update = (patch: Partial<FieldSchema>) =>
    onChangeField(sectionId, field.id, patch);

  return (
    <div className="props-editor">
      <h3 className="props-title">{field.type}</h3>

      <label className="prop-field">
        <span>标签</span>
        <input
          value={field.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </label>

      <label className="prop-field">
        <span>占位提示</span>
        <input
          value={field.placeholder ?? ""}
          placeholder="占位提示"
          onChange={(e) => update({ placeholder: e.target.value })}
        />
      </label>

      <label className="prop-field">
        <span>帮助文本</span>
        <input
          value={field.helpText ?? ""}
          placeholder="帮助文本"
          onChange={(e) => update({ helpText: e.target.value })}
        />
      </label>

      <label className="prop-check">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => update({ required: e.target.checked })}
        />
        <span>必填</span>
      </label>

      {(field.type === "select" ||
        field.type === "radio" ||
        field.type === "checkbox") && (
        <OptionsEditor options={field.options ?? []} onChange={update} />
      )}

      {(field.type === "text" || field.type === "textarea") && (
        <RuleEditor
          rules={[
            { type: "minLength", label: "最小长度", numeric: true },
            { type: "maxLength", label: "最大长度", numeric: true },
            { type: "regex", label: "正则表达式", numeric: false },
          ]}
          field={field}
          onChange={update}
        />
      )}

      {field.type === "number" && (
        <RuleEditor
          rules={[
            { type: "min", label: "最小值", numeric: true },
            { type: "max", label: "最大值", numeric: true },
          ]}
          field={field}
          onChange={update}
        />
      )}

      {field.type === "file" && (
        <>
          <label className="prop-field">
            <span>允许类型（逗号分隔）</span>
            <input
              value={(field.allowTypes ?? []).join(",")}
              onChange={(e) =>
                update({
                  allowTypes: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="prop-field">
            <span>最大大小（MB）</span>
            <input
              type="number"
              value={field.maxSizeMB ?? ""}
              onChange={(e) => update({ maxSizeMB: Number(e.target.value) })}
            />
          </label>
          <label className="prop-field">
            <span>最大数量</span>
            <input
              type="number"
              value={field.maxCount ?? ""}
              onChange={(e) => update({ maxCount: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {field.type === "user-picker" && (
        <label className="prop-check">
          <input
            type="checkbox"
            checked={field.multiple ?? false}
            onChange={(e) => update({ multiple: e.target.checked })}
          />
          <span>允许多选</span>
        </label>
      )}

      {field.type === "info-text" && (
        <>
          <label className="prop-field">
            <span>说明文字</span>
            <textarea
              value={field.text ?? ""}
              onChange={(e) => update({ text: e.target.value })}
            />
          </label>
          <label className="prop-field">
            <span>样式</span>
            <select
              value={field.styleType ?? "info"}
              onChange={(e) =>
                update({ styleType: e.target.value as InfoTextStyle })
              }
            >
              <option value="info">信息</option>
              <option value="warning">警告</option>
              <option value="danger">危险</option>
            </select>
          </label>
        </>
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
  const setOption = (index: number, patch: Partial<SelectOption>) => {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ options: next });
  };

  return (
    <div className="options-editor">
      <span className="prop-label">选项</span>
      {options.map((option, index) => (
        <div className="option-row" key={index}>
          <input
            aria-label={`选项${index + 1}标签`}
            value={option.label}
            onChange={(e) => setOption(index, { label: e.target.value })}
          />
          <input
            aria-label={`选项${index + 1}值`}
            value={option.value}
            onChange={(e) => setOption(index, { value: e.target.value })}
          />
          <button
            type="button"
            aria-label={`删除选项${index + 1}`}
            onClick={() => onChange({ options: options.filter((_, i) => i !== index) })}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="options-add"
        onClick={() =>
          onChange({
            options: [...options, { label: "新选项", value: `option${options.length + 1}` }],
          })
        }
      >
        + 添加选项
      </button>
    </div>
  );
}

function RuleEditor({
  rules,
  field,
  onChange,
}: {
  rules: { type: ValidationRuleType; label: string; numeric: boolean }[];
  field: FieldSchema;
  onChange: (patch: Partial<FieldSchema>) => void;
}) {
  return (
    <div className="rules-editor">
      <span className="prop-label">验证规则</span>
      {rules.map(({ type, label, numeric }) => {
        const rule = field.validation?.rules.find((r) => r.type === type);
        const raw = rule?.value;
        const value = raw == null ? "" : String(raw);
        return (
          <label className="prop-field" key={type}>
            <span>{label}</span>
            <input
              type={numeric ? "number" : "text"}
              value={value}
              placeholder="留空表示不校验"
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  onChange({ validation: removeRule(field, type).validation });
                  return;
                }
                const next = setRule(field, type, {
                  value: numeric ? Number(v) : v,
                });
                onChange({ validation: next.validation });
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

// ── 审批链 tab ──────────────────────────────────────────────────────────────

function describeRule(node: ApprovalNode): string {
  const rule = node.approverRule;
  if (rule.type === "specific") return `指定人员：${rule.userId}`;
  if (rule.type === "role") return `角色：${rule.roleId}`;
  return rule.relation === "direct_manager" ? "直属上级" : "部门主管";
}

function ApprovalTab({ approvalChain }: { approvalChain?: ApprovalChain }) {
  const nodes = approvalChain?.nodes ?? [];
  if (nodes.length === 0) {
    return <p className="panel-empty">无审批链（模板可直接发布）</p>;
  }
  return (
    <ol className="approval-list">
      {nodes.map((node) => (
        <li className="approval-node" key={node.id}>
          <span className="approval-order">{node.order + 1}</span>
          <span className="approval-label">{node.label ?? "审批节点"}</span>
          <span className="approval-rule">{describeRule(node)}</span>
        </li>
      ))}
    </ol>
  );
}

// ── 预览 tab ────────────────────────────────────────────────────────────────

function PreviewTab({ schema }: { schema: DesignerSchema }) {
  if (schema.sections.length === 0) {
    return <p className="panel-empty">暂无字段可预览</p>;
  }
  return (
    <div className="preview">
      <Form schema={schema} readOnly />
    </div>
  );
}
