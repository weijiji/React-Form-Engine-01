import type { FieldType } from "form-engine-core";
import { FIELD_LABELS, type DesignerSchema } from "./schemaModel";
import { FIELD_REORDER_MIME, FIELD_TYPE_MIME } from "./palette";

export interface DesignCanvasProps {
  schema: DesignerSchema;
  selectedFieldId: string | null;
  onDropField: (type: FieldType) => void;
  onSelectField: (fieldId: string | null) => void;
  onMoveField: (sectionId: string, fieldId: string, delta: -1 | 1) => void;
  onReorderField: (sectionId: string, fieldId: string, targetIndex: number) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onAddSection: () => void;
  onUpdateSectionTitle: (sectionId: string, title: string) => void;
}

/**
 * Center column — the drop target and section/field list. Field types dropped
 * from the palette are appended to the target section; field rows can be
 * reordered by drag handle or up/down buttons, and selected to edit properties.
 */
export const DesignCanvas: React.FC<DesignCanvasProps> = ({
  schema,
  selectedFieldId,
  onDropField,
  onSelectField,
  onMoveField,
  onReorderField,
  onRemoveField,
  onAddSection,
  onUpdateSectionTitle,
}) => {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(FIELD_TYPE_MIME) as FieldType;
    if (type) onDropField(type);
  };

  return (
    <div
      className="canvas"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="canvas-toolbar">
        <span className="canvas-hint">拖拽字段到此处，点击字段编辑属性</span>
        <button type="button" className="canvas-add-section" onClick={onAddSection}>
          + 添加章节
        </button>
      </div>

      {schema.sections.length === 0 && (
        <div className="canvas-empty">从左侧拖拽字段组件到画布开始设计</div>
      )}

      {schema.sections.map((section) => (
        <section className="canvas-section" key={section.id}>
          <header className="canvas-section-header">
            <input
              className="canvas-section-title"
              value={section.title}
              aria-label="章节标题"
              onChange={(e) => onUpdateSectionTitle(section.id, e.target.value)}
            />
            <span className="canvas-section-count">{section.fields.length} 个字段</span>
          </header>

          <div className="canvas-fields">
            {section.fields.length === 0 && (
              <div className="canvas-fields-empty">拖拽字段到此章节</div>
            )}
            {section.fields.map((field, index) => (
              <div
                key={field.id}
                className={
                  field.id === selectedFieldId
                    ? "canvas-field selected"
                    : "canvas-field"
                }
                onClick={() => onSelectField(field.id)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(FIELD_REORDER_MIME)) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  const raw = e.dataTransfer.getData(FIELD_REORDER_MIME);
                  if (!raw) return;
                  try {
                    const { fieldId } = JSON.parse(raw) as { fieldId: string };
                    if (fieldId && fieldId !== field.id) {
                      onReorderField(section.id, fieldId, index);
                    }
                  } catch {
                    // Ignore malformed reorder payloads.
                  }
                }}
              >
                <span
                  className="canvas-field-handle"
                  title="拖拽排序"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      FIELD_REORDER_MIME,
                      JSON.stringify({ fieldId: field.id, sectionId: section.id }),
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="拖拽排序"
                >
                  ⋮⋮
                </span>

                <div className="canvas-field-info" onClick={() => onSelectField(field.id)}>
                  <span className="canvas-field-label">{field.label}</span>
                  <span className="canvas-field-type">{FIELD_LABELS[field.type]}</span>
                </div>

                <div className="canvas-field-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    aria-label="上移"
                    disabled={index === 0}
                    onClick={() => onMoveField(section.id, field.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="下移"
                    disabled={index === section.fields.length - 1}
                    onClick={() => onMoveField(section.id, field.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="删除字段"
                    onClick={() => onRemoveField(section.id, field.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
