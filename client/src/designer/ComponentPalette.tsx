import type { FieldType } from "form-engine-core";
import { PALETTE_GROUPS, FIELD_TYPE_MIME } from "./palette";
import { GripIcon } from "./icons";

export interface ComponentPaletteProps {
  /** Called when a palette item is dropped or clicked. */
  onAddField: (type: FieldType) => void;
  /** 只读模式：禁用拖拽与点击/键盘添加（未签出 / 他人锁定 / 已归档）。 */
  readonly?: boolean;
}

/**
 * Left rail — the grouped, draggable field types (布局/基础/选择/日期/高级).
 * Each item is HTML5-draggable (palette → canvas) and clickable/Enter-activatable.
 * In readonly mode the items stay visible but are inert (no drag, no click).
 */
export const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  onAddField,
  readonly = false,
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
                className={readonly ? "comp-item readonly" : "comp-item"}
                role="option"
                aria-label={`添加${item.name}`}
                aria-disabled={readonly}
                title={readonly ? "只读模式，签出后可编辑" : "点击添加 / 拖拽到画布"}
                tabIndex={readonly ? -1 : 0}
                draggable={!readonly}
                onDragStart={
                  readonly
                    ? undefined
                    : (e) => {
                        e.dataTransfer.setData(FIELD_TYPE_MIME, item.type);
                        e.dataTransfer.effectAllowed = "copy";
                      }
                }
                onClick={readonly ? undefined : () => onAddField(item.type)}
                onKeyDown={
                  readonly
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onAddField(item.type);
                        }
                      }
                }
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
