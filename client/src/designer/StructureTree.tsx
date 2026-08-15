import { useState } from "react";
import { IconButton } from "../components";
import {
  CaretIcon,
  CheckIcon,
  DownIcon,
  PlusIcon,
  SectionIcon,
  TrashIcon,
  UpIcon,
} from "./icons";
import { FIELD_REORDER_MIME } from "./palette";
import { FIELD_LABELS, type DesignerSchema } from "./schemaModel";

export interface StructureTreeProps {
  schema: DesignerSchema;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddFieldToSection: (sectionId: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onMoveField: (sectionId: string, fieldId: string, delta: -1 | 1) => void;
  onReorderField: (sectionId: string, fieldId: string, targetIndex: number) => void;
}

/**
 * 结构树 tab — sections as collapsible parent nodes and fields as draggable
 * leaves. Field order is editable via up/down buttons or drag-and-drop.
 */
export const StructureTree: React.FC<StructureTreeProps> = ({
  schema,
  selectedId,
  onSelect,
  onAddFieldToSection,
  onRemoveSection,
  onRemoveField,
  onMoveField,
  onReorderField,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <div className="tree">
      {schema.sections.map((section) => {
        const isCollapsed = collapsed.has(section.id);
        return (
          <div className="tree-node sec" key={section.id}>
            <div
              className={
                selectedId === section.id
                  ? "tree-node-head selected"
                  : "tree-node-head"
              }
              onClick={() => {
                toggleCollapse(section.id);
                onSelect(section.id);
              }}
            >
              <CaretIcon
                className="caret"
                style={{ transform: isCollapsed ? "rotate(-90deg)" : undefined }}
              />
              <SectionIcon className="t-ico" />
              <span className="t-name">{section.title}</span>
              <span className="t-type">章节 · {section.fields.length}</span>
              <span className="t-tools">
                <IconButton
                  size="xs"
                  label="添加字段"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddFieldToSection(section.id);
                  }}
                >
                  <PlusIcon />
                </IconButton>
                <IconButton
                  size="xs"
                  variant="danger"
                  label="删除章节"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSection(section.id);
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </span>
            </div>

            {!isCollapsed && (
              <div className="tree-children">
                {section.fields.map((field, index) => (
                  <div
                    className="tree-node"
                    key={field.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        FIELD_REORDER_MIME,
                        JSON.stringify({ fieldId: field.id, sectionId: section.id }),
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
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
                    <div
                      className={
                        selectedId === field.id
                          ? "tree-node-head selected"
                          : "tree-node-head"
                      }
                      onClick={() => onSelect(field.id)}
                    >
                      <CheckIcon className="t-ico" />
                      <span className="t-name">
                        {field.label}
                        {field.required && (
                          <span style={{ color: "var(--danger)" }}> *</span>
                        )}
                      </span>
                      <span className="t-type">{FIELD_LABELS[field.type]}</span>
                      <span className="t-tools">
                        <IconButton
                          size="xs"
                          label="上移"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveField(section.id, field.id, -1);
                          }}
                        >
                          <UpIcon />
                        </IconButton>
                        <IconButton
                          size="xs"
                          label="下移"
                          disabled={index === section.fields.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveField(section.id, field.id, 1);
                          }}
                        >
                          <DownIcon />
                        </IconButton>
                        <IconButton
                          size="xs"
                          variant="danger"
                          label="删除"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveField(section.id, field.id);
                          }}
                        >
                          <TrashIcon />
                        </IconButton>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
