import type { FieldSchema, FieldType } from "form-engine-core";
import { Button, IconButton } from "../components";
import { Form } from "../form/Form";
import { CopyIcon, FileIcon, TrashIcon, UserIcon } from "./icons";
import { FIELD_TYPE_MIME } from "./palette";
import type { DesignerSchema } from "./schemaModel";

export interface DesignCanvasProps {
  schema: DesignerSchema;
  templateName: string;
  /** Selected field id or section id, or null. */
  selectedId: string | null;
  mode: "static" | "test";
  onSelect: (id: string | null) => void;
  onDropField: (type: FieldType) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onDuplicateField: (sectionId: string, fieldId: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onAddSection: () => void;
}

/**
 * Center column — a live preview of the form (the prototype's "静态预览" canvas).
 * The white card renders the template name head, then sections (dashed) and
 * field cards (label + required + readonly control + help); clicking a
 * field/section selects it. In `test` mode the interactive `<Form>` engine is
 * rendered instead, wrapped in `.canvas-form` so designer.css can restyle it to
 * match the static preview (section cards, fonts, full-bleed background) without
 * touching the filler's form.css.
 */
export const DesignCanvas: React.FC<DesignCanvasProps> = ({
  schema,
  templateName,
  selectedId,
  mode,
  onSelect,
  onDropField,
  onRemoveField,
  onDuplicateField,
  onRemoveSection,
  onAddSection,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(FIELD_TYPE_MIME) as FieldType;
    if (type) onDropField(type);
  };

  return (
    <div
      className="canvas"
      onClick={() => onSelect(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="canvas-inner" onClick={(e) => e.stopPropagation()}>
        <div className="canvas-head">
          <h2>{templateName}</h2>
          <p>
            请完整填写以下信息，带{" "}
            <span style={{ color: "var(--danger)" }}>*</span> 为必填项
          </p>
        </div>
        {mode === "test" ? (
          <div className="canvas-form">
            <Form schema={schema} />
          </div>
        ) : (
          <>
            {schema.sections.length === 0 && (
              <div className="empty-canvas">
                画布为空。从左侧「组件面板」点击或拖拽组件到此处开始设计。
                <div>
                  <Button size="sm" className="empty-canvas-btn" onClick={onAddSection}>
                    添加章节
                  </Button>
                </div>
              </div>
            )}

            {schema.sections.map((section) => (
              <div
                key={section.id}
                className={
                  section.id === selectedId ? "fld-section selected" : "fld-section"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(section.id);
                }}
              >
                <div className="sec-head">
                  <span className="sec-dot" />
                  <span className="sec-title">{section.title}</span>
                  <span className="sec-count">{section.fields.length} 个字段</span>
                  <div className="sec-tools">
                    <IconButton
                      size="sm"
                      label="删除章节"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSection(section.id);
                      }}
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
                </div>

                {section.fields.map((field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    selected={field.id === selectedId}
                    onSelect={onSelect}
                    onRemove={() => onRemoveField(section.id, field.id)}
                    onDuplicate={() => onDuplicateField(section.id, field.id)}
                  />
                ))}

                {section.fields.length === 0 && (
                  <div className="empty-canvas" style={{ padding: 20 }}>
                    该章节暂无字段，点击左侧组件添加
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

function FieldCard({
  field,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
}: {
  field: FieldSchema;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      className={selected ? "fld selected" : "fld"}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(field.id);
      }}
    >
      <div className="fld-tools">
        <IconButton
          size="sm"
          label="删除"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <TrashIcon />
        </IconButton>
        <IconButton
          size="sm"
          label="复制"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <CopyIcon />
        </IconButton>
      </div>

      <label>
        {field.label}
        {field.required && <span className="req"> *</span>}
      </label>

      <FieldControl field={field} />

      {field.helpText && <div className="fld-help">{field.helpText}</div>}
    </div>
  );
}

/** Read-only control preview, mirroring the prototype's `renderControl`. */
function FieldControl({ field }: { field: FieldSchema }) {
  switch (field.type) {
    case "text":
    case "number":
      return (
        <input
          className="fld-control"
          type={field.type === "number" ? "number" : "text"}
          value={field.defaultValue == null ? "" : String(field.defaultValue)}
          placeholder={field.placeholder}
          readOnly
        />
      );
    case "textarea":
      return (
        <textarea
          className="fld-control multi"
          rows={3}
          value={field.defaultValue == null ? "" : String(field.defaultValue)}
          placeholder={field.placeholder}
          readOnly
        />
      );
    case "select":
      return (
        <select className="fld-control" disabled>
          <option value="">请选择</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case "radio":
    case "checkbox":
      return (
        <>
          {(field.options ?? []).map((o) => (
            <label
              className="check-row"
              style={{ marginBottom: 6 }}
              key={o.value}
            >
              <input type={field.type} disabled /> {o.label}
            </label>
          ))}
        </>
      );
    case "date":
      return <input className="fld-control" type="date" readOnly />;
    case "datetime":
      return <input className="fld-control" type="datetime-local" readOnly />;
    case "file":
      return (
        <div
          className="fld-control"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-3)",
          }}
        >
          <FileIcon className="icon" />
          <span>点击上传文件（{field.maxSizeMB ?? 10}MB）</span>
        </div>
      );
    case "user-picker":
      return (
        <div
          className="fld-control"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-3)",
          }}
        >
          <UserIcon className="icon" />
          <span>{field.placeholder || "选择人员"}</span>
        </div>
      );
    case "info-text":
      return <div className="fld-help">{field.text}</div>;
    case "subform":
      return <div className="fld-help">子表单（{field.subSchema?.fields.length ?? 0} 列）</div>;
    case "section":
      return <div className="fld-help">{field.label}</div>;
    default:
      return null;
  }
}
