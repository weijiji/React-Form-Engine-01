import type { FieldType } from "form-engine-core";
import { PALETTE_GROUPS, FIELD_TYPE_MIME } from "./palette";
import { GripIcon } from "./icons";

export interface ComponentPaletteProps {
  /** Called when a palette item is dropped or clicked. */
  onAddField: (type: FieldType) => void;
}

/**
 * Left rail — the grouped, draggable field types (布局/基础/选择/日期/高级).
 * Each item is HTML5-draggable (palette → canvas) and clickable/Enter-activatable.
 */
export const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  onAddField,
}) => (
  <aside className="comp-panel">
    <div className="panel-title">组件面板</div>
    <div className="panel-scroll" role="listbox" aria-label="字段组件">
      {PALETTE_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="comp-group">{group.label}</div>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.type}
                className="comp-item"
                role="option"
                aria-label={`添加${item.name}`}
                title="点击添加 / 拖拽到画布"
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
                <Icon />
                <span>{item.name}</span>
                <GripIcon className="grip" />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  </aside>
);
