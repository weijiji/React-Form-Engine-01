import type { FieldType } from "form-engine-core";
import { FIELD_PALETTE, FIELD_TYPE_MIME } from "./palette";

export interface ComponentPaletteProps {
  /** Called when a palette item is dropped or clicked. */
  onAddField: (type: FieldType) => void;
}

/**
 * Left rail — the draggable field types. Each item is HTML5-draggable (drag the
 * payload to the canvas) and clickable/Enter-activatable for accessibility.
 */
export const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  onAddField,
}) => (
  <div className="palette">
    <h2 className="palette-title">组件面板</h2>
    <div className="palette-list" role="listbox" aria-label="字段组件">
      {FIELD_PALETTE.map((item) => (
        <div
          key={item.type}
          className="palette-item"
          role="option"
          aria-label={`添加${item.label}`}
          tabIndex={0}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(FIELD_TYPE_MIME, item.type);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onAddField(item.type)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAddField(item.type);
            }
          }}
        >
          <span className="palette-item-label">{item.label}</span>
          <span className="palette-item-desc">{item.description}</span>
        </div>
      ))}
    </div>
  </div>
);
