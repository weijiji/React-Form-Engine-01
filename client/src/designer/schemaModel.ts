import type {
  FieldSchema,
  FieldType,
  FieldValidation,
  SectionSchema,
  ValidationRule,
  ValidationRuleType,
} from "form-engine-core";

/**
 * Designer schema model — pure helpers for building/editing the raw `schema`
 * JSONB a designer edits (sections → fields). Everything here is a pure function
 * returning new objects (no mutation), so it is unit-testable without a DOM.
 */

export interface DesignerSchema {
  schemaVersion: string;
  sections: SectionSchema[];
}

export const DESIGNER_SCHEMA_VERSION = "1.0.0";

/** Field-type → display name (shown in the structure tree and palette). */
export const FIELD_LABELS: Record<FieldType, string> = {
  text: "文本输入",
  textarea: "多行文本",
  number: "数字输入",
  select: "下拉框",
  radio: "单选按钮",
  checkbox: "多选框",
  date: "日期选择",
  datetime: "日期时间",
  file: "文件上传",
  subform: "子表单",
  "user-picker": "人员选择",
  section: "章节容器",
  "info-text": "说明文字",
};

/** Field-type → default label assigned when a field is first added. */
export const DEFAULT_FIELD_NAMES: Record<FieldType, string> = {
  text: "文本字段",
  textarea: "多行文本",
  number: "数字字段",
  select: "下拉选项",
  radio: "单选组",
  checkbox: "多选组",
  date: "日期",
  datetime: "日期时间",
  file: "文件上传",
  subform: "子表单",
  "user-picker": "人员选择",
  section: "章节",
  "info-text": "说明文字",
};

let idCounter = 0;

/** Generate a unique field/section id (UUID-backed when available). */
export function newId(prefix: string): string {
  idCounter += 1;
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${idCounter}`;
  return `${prefix}-${uuid}`;
}

export function createEmptySchema(): DesignerSchema {
  return { schemaVersion: DESIGNER_SCHEMA_VERSION, sections: [] };
}

export function createSection(title = "新章节"): SectionSchema {
  return { id: newId("sec"), title, fields: [] };
}

/** Build a new field with sensible defaults for its type. */
export function createField(type: FieldType): FieldSchema {
  const field: FieldSchema = {
    id: newId("fld"),
    type,
    label: DEFAULT_FIELD_NAMES[type],
    required: false,
  };

  switch (type) {
    case "select":
    case "radio":
    case "checkbox":
      field.options = [
        { label: "选项一", value: "option1" },
        { label: "选项二", value: "option2" },
        { label: "选项三", value: "option3" },
      ];
      break;
    case "subform":
      field.subSchema = { fields: [] };
      break;
    case "user-picker":
      field.multiple = false;
      break;
    case "file":
      field.allowTypes = ["pdf", "png", "jpg"];
      field.maxSizeMB = 5;
      field.maxCount = 3;
      break;
    case "info-text":
      field.styleType = "info";
      field.text = "这是一段说明文字";
      break;
    default:
      break;
  }

  return field;
}

/** Add a default section when the schema has none (so a drop always has a home). */
export function ensureSection(schema: DesignerSchema): DesignerSchema {
  if (schema.sections.length > 0) return schema;
  return { ...schema, sections: [createSection()] };
}

export function addSection(
  schema: DesignerSchema,
  section: SectionSchema,
): DesignerSchema {
  return { ...schema, sections: [...schema.sections, section] };
}

function mapSection(
  schema: DesignerSchema,
  sectionId: string,
  fn: (section: SectionSchema) => SectionSchema,
): DesignerSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
  };
}

export function updateSection(
  schema: DesignerSchema,
  sectionId: string,
  patch: Partial<SectionSchema>,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => ({ ...s, ...patch }));
}

export function addField(
  schema: DesignerSchema,
  sectionId: string,
  field: FieldSchema,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => ({
    ...s,
    fields: [...s.fields, field],
  }));
}

export function removeField(
  schema: DesignerSchema,
  sectionId: string,
  fieldId: string,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => ({
    ...s,
    fields: s.fields.filter((f) => f.id !== fieldId),
  }));
}

/** Remove a top-level section (and all its fields). */
export function removeSection(
  schema: DesignerSchema,
  sectionId: string,
): DesignerSchema {
  return { ...schema, sections: schema.sections.filter((s) => s.id !== sectionId) };
}

/** Clone a field (new id, "（副本）" label) and insert it after the original. */
export function duplicateField(
  schema: DesignerSchema,
  sectionId: string,
  fieldId: string,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => {
    const index = s.fields.findIndex((f) => f.id === fieldId);
    if (index < 0) return s;
    const copy: FieldSchema = {
      ...structuredClone(s.fields[index]),
      id: newId("fld"),
      label: `${s.fields[index].label}（副本）`,
    };
    const fields = [...s.fields];
    fields.splice(index + 1, 0, copy);
    return { ...s, fields };
  });
}

export function updateField(
  schema: DesignerSchema,
  sectionId: string,
  fieldId: string,
  patch: Partial<FieldSchema>,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => ({
    ...s,
    fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
  }));
}

/** Move a field up (delta -1) or down (delta +1) within its section. No-op at bounds. */
export function moveField(
  schema: DesignerSchema,
  sectionId: string,
  fieldId: string,
  delta: -1 | 1,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => {
    const index = s.fields.findIndex((f) => f.id === fieldId);
    if (index < 0) return s;
    const target = index + delta;
    if (target < 0 || target >= s.fields.length) return s;
    const fields = [...s.fields];
    const [item] = fields.splice(index, 1);
    fields.splice(target, 0, item);
    return { ...s, fields };
  });
}

/** Move a field to an absolute index within its section (drag-handle reorder). */
export function reorderField(
  schema: DesignerSchema,
  sectionId: string,
  fieldId: string,
  targetIndex: number,
): DesignerSchema {
  return mapSection(schema, sectionId, (s) => {
    const from = s.fields.findIndex((f) => f.id === fieldId);
    if (from < 0) return s;
    const fields = [...s.fields];
    const [item] = fields.splice(from, 1);
    const clamped = Math.max(0, Math.min(targetIndex, fields.length));
    fields.splice(clamped, 0, item);
    return { ...s, fields };
  });
}

export function findField(
  schema: DesignerSchema,
  fieldId: string,
): { sectionId: string; field: FieldSchema } | null {
  for (const section of schema.sections) {
    const field = section.fields.find((f) => f.id === fieldId);
    if (field) return { sectionId: section.id, field };
  }
  return null;
}

/** Upsert a validation rule (e.g. minLength=10) into a field's validation rules. */
export function setRule(
  field: FieldSchema,
  ruleType: ValidationRuleType,
  patch: { value?: unknown; message?: string },
): FieldSchema {
  const rules: ValidationRule[] = field.validation?.rules ?? [];
  const existing = rules.find((r) => r.type === ruleType);
  const next: FieldValidation = {
    rules: existing
      ? rules.map((r) => (r.type === ruleType ? { ...r, ...patch } : r))
      : [...rules, { type: ruleType, ...patch }],
  };
  return { ...field, validation: next };
}

export function removeRule(
  field: FieldSchema,
  ruleType: ValidationRuleType,
): FieldSchema {
  const rules = (field.validation?.rules ?? []).filter(
    (r) => r.type !== ruleType,
  );
  return { ...field, validation: { rules } };
}
