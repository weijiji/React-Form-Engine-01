/**
 * NL creation — FormStructureSuggestion (ADR-0013).
 *
 * Pure-logic module, zero runtime dependencies. Three pieces:
 *
 *  - {@link normalizeSuggestion}  defensive normalizer for LLM output — coerces
 *    unknown field types to `text`, backfills missing labels/titles, truncates
 *    long strings (cost / output control), keeps `options` only on choice types.
 *  - {@link matchRuleSuggestion}   the local rule-fallback engine (6 preset
 *    examples keyed by keyword, aligned with UX spec §4.2). Used when the LLM
 *    is unconfigured, fails, or returns an unusable structure.
 *  - {@link translateSuggestion}   deterministic translator — turns a suggestion
 *    into a full engine schema (schemaVersion + section/field ids + options as
 *    `{label,value}`), gated through `SchemaParser` so the output is always legal.
 *
 * The whole point of the intermediate structure (CONTEXT.md "表单结构建议") is to
 * keep the LLM responsible only for understanding the request, while correctness
 * lives in deterministic code.
 */

import { parseSchema } from "./schemaParser";
import type { FieldSchema, SectionSchema } from "./types";

// ── Suggestion types ─────────────────────────────────────────────────────────

/**
 * Field types the NL layer understands. A subset of the engine's `FIELD_TYPES` —
 * `section`/`info-text`/`subform` are designer-level, not NL-level. Unknown
 * types normalize to `text`.
 */
export const NL_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "datetime",
  "file",
  "user-picker",
] as const;

export type NlFieldType = (typeof NL_FIELD_TYPES)[number];

export interface NlField {
  label: string;
  type: NlFieldType;
  required: boolean;
  /** Choice types only (select/radio/checkbox). */
  options?: string[];
}

export interface NlSection {
  title: string;
  fields: NlField[];
}

/** The AI-generated, user-editable intermediate structure (CONTEXT.md). */
export interface FormStructureSuggestion {
  name: string;
  description?: string;
  sections: NlSection[];
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type SuggestionErrorCode = "NL_SUGGESTION_INVALID" | "NL_SUGGESTION_EMPTY";

export class SuggestionError extends Error {
  readonly code: SuggestionErrorCode;

  constructor(code: SuggestionErrorCode, message: string) {
    super(message);
    this.name = "SuggestionError";
    this.code = code;
  }
}

// ── Length caps (cost / output control) ──────────────────────────────────────

const MAX_NAME = 60;
const MAX_LABEL = 60;
const MAX_OPTION = 40;
const MAX_SECTIONS = 20;
const MAX_FIELDS_PER_SECTION = 50;
const MAX_OPTIONS_PER_FIELD = 30;

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// ── Normalization (LLM output → typed suggestion) ────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim() === "") return "";
  return clip(value.trim(), max);
}

function normalizeOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((o) => (typeof o === "string" || typeof o === "number" ? String(o).trim() : ""))
    .filter((o) => o !== "")
    .slice(0, MAX_OPTIONS_PER_FIELD);
  return options.length > 0 ? options.map((o) => clip(o, MAX_OPTION)) : undefined;
}

const CHOICE_TYPES: readonly NlFieldType[] = ["select", "radio", "checkbox"];

function normalizeField(raw: unknown): NlField {
  const obj = isObject(raw) ? raw : {};
  const label = asNonEmptyString(obj.label, MAX_LABEL) || "未命名字段";
  const rawType = typeof obj.type === "string" ? obj.type : "";
  const type: NlFieldType = (NL_FIELD_TYPES as readonly string[]).includes(rawType)
    ? (rawType as NlFieldType)
    : "text";
  const required = obj.required === true;
  return {
    label,
    type,
    required,
    ...(CHOICE_TYPES.includes(type) ? { options: normalizeOptions(obj.options) } : {}),
  };
}

function normalizeSection(raw: unknown): NlSection {
  const obj = isObject(raw) ? raw : {};
  const title = asNonEmptyString(obj.title, MAX_LABEL) || "基本信息";
  const fields = Array.isArray(obj.fields) ? obj.fields : [];
  return {
    title,
    fields: fields.slice(0, MAX_FIELDS_PER_SECTION).map(normalizeField),
  };
}

/**
 * Defensively normalize arbitrary LLM output into a typed {@link FormStructureSuggestion}.
 * Throws {@link SuggestionError} (`NL_SUGGESTION_INVALID`) for structurally unusable
 * input (non-object / missing name / sections not an array). Field-level defects
 * are repaired, never thrown — the caller decides what to do with the result.
 */
export function normalizeSuggestion(raw: unknown): FormStructureSuggestion {
  if (!isObject(raw)) {
    throw new SuggestionError("NL_SUGGESTION_INVALID", "建议结构必须是一个对象");
  }
  const name = asNonEmptyString(raw.name, MAX_NAME);
  if (!name) {
    throw new SuggestionError("NL_SUGGESTION_INVALID", "建议结构缺少模板名称");
  }
  if (!Array.isArray(raw.sections)) {
    throw new SuggestionError("NL_SUGGESTION_INVALID", "建议结构的 sections 必须是数组");
  }
  const description = asNonEmptyString(raw.description, MAX_NAME) || undefined;
  return {
    name,
    ...(description ? { description } : {}),
    sections: raw.sections.slice(0, MAX_SECTIONS).map(normalizeSection),
  };
}

/** Total field count across all sections (0 ⇒ the suggestion is unusable). */
export function suggestionFieldCount(suggestion: FormStructureSuggestion): number {
  return suggestion.sections.reduce((sum, s) => sum + s.fields.length, 0);
}

// ── Rule-fallback engine (6 preset examples, UX spec §4.2) ───────────────────

interface RuleTemplate {
  keywords: string[];
  build: () => FormStructureSuggestion;
}

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    keywords: ["请假"],
    build: () => ({
      name: "日常请假申请单",
      description: "员工日常请假的申请表单",
      sections: [
        {
          title: "请假信息",
          fields: [
            { label: "请假类型", type: "select", required: true, options: ["年假", "事假", "病假", "调休"] },
            { label: "开始日期", type: "date", required: true },
            { label: "结束日期", type: "date", required: true },
            { label: "请假天数", type: "number", required: true },
            { label: "请假事由", type: "textarea", required: false },
          ],
        },
      ],
    }),
  },
  {
    keywords: ["采购"],
    build: () => ({
      name: "办公用品采购申请表",
      description: "办公用品采购的申请与审批表单",
      sections: [
        {
          title: "采购信息",
          fields: [
            { label: "物品清单", type: "textarea", required: true },
            { label: "预算金额", type: "number", required: true },
            { label: "采购用途", type: "textarea", required: true },
            { label: "期望到货日期", type: "date", required: false },
            { label: "附件", type: "file", required: false },
          ],
        },
      ],
    }),
  },
  {
    keywords: ["设备", "报备"],
    build: () => ({
      name: "设备报备单",
      description: "办公/研发设备的使用报备表单",
      sections: [
        {
          title: "设备信息",
          fields: [
            { label: "设备名称", type: "text", required: true },
            { label: "设备类型", type: "select", required: true, options: ["办公设备", "研发设备"] },
            { label: "设备编号", type: "text", required: false },
            { label: "报备原因", type: "textarea", required: true },
            { label: "附件", type: "file", required: false },
          ],
        },
      ],
    }),
  },
  {
    keywords: ["报销", "费用"],
    build: () => ({
      name: "差旅费用报销单",
      description: "差旅费用报销的申请表单",
      sections: [
        {
          title: "报销信息",
          fields: [
            { label: "出差日期", type: "date", required: true },
            { label: "出差事由", type: "textarea", required: true },
            { label: "费用明细", type: "textarea", required: true },
            { label: "报销总额", type: "number", required: true },
            { label: "发票附件", type: "file", required: true },
          ],
        },
      ],
    }),
  },
  {
    keywords: ["出差"],
    build: () => ({
      name: "出差申请单",
      description: "员工出差申请与行程登记",
      sections: [
        {
          title: "出差信息",
          fields: [
            { label: "目的地", type: "text", required: true },
            { label: "出发日期", type: "date", required: true },
            { label: "返回日期", type: "date", required: true },
            { label: "出差事由", type: "textarea", required: true },
            { label: "预估费用", type: "number", required: false },
          ],
        },
      ],
    }),
  },
  {
    keywords: ["入职", "员工"],
    build: () => ({
      name: "员工入职信息登记表",
      description: "新员工入职信息采集",
      sections: [
        {
          title: "基本信息",
          fields: [
            { label: "姓名", type: "text", required: true },
            { label: "工号", type: "text", required: true },
            { label: "入职日期", type: "date", required: true },
            { label: "手机号码", type: "text", required: true },
            { label: "电子邮箱", type: "text", required: true },
            { label: "所属部门", type: "select", required: true, options: ["技术部", "产品部", "设计部", "市场部"] },
            { label: "试用期（月）", type: "number", required: false },
          ],
        },
      ],
    }),
  },
];

/**
 * Match a natural-language request against the preset examples. Returns a fresh
 * copy (callers may edit the structure in the preview). `null` when nothing hits.
 */
export function matchRuleSuggestion(message: string): FormStructureSuggestion | null {
  const text = message.trim();
  if (!text) return null;
  for (const rule of RULE_TEMPLATES) {
    if (rule.keywords.some((k) => text.includes(k))) {
      return rule.build();
    }
  }
  return null;
}

// ── Translation (suggestion → legal engine schema) ───────────────────────────

/**
 * Deterministically translate a suggestion into a full engine schema and gate it
 * through `SchemaParser` — the output is guaranteed legal (`schemaVersion`,
 * unique section/field ids, options as `{label,value}`).
 */
export function translateSuggestion(
  suggestion: FormStructureSuggestion,
): { schemaVersion: string; sections: SectionSchema[] } {
  let sectionSeq = 0;
  let fieldSeq = 0;

  const sections: SectionSchema[] = suggestion.sections.map((s) => {
    const fields: FieldSchema[] = s.fields.map((f) => {
      const field: FieldSchema = {
        id: `fld-${++fieldSeq}`,
        type: f.type,
        label: f.label,
        required: f.required,
      };
      if (f.options && f.options.length > 0) {
        field.options = f.options.map((option) => ({ label: option, value: option }));
      }
      return field;
    });
    return { id: `sec-${++sectionSeq}`, title: s.title, fields };
  });

  const schema = {
    schemaVersion: "1.0.0",
    sections,
  };

  // Validation gate — should never throw for our deterministic construction, but
  // guarantees the stored JSONB is always acceptable to the engine.
  parseSchema(schema);
  return schema;
}
