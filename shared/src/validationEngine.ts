/**
 * ValidationEngine — field-level and full-form validation.
 *
 *  - `validateField(fieldSchema, value)` runs the field's own rules:
 *    required, minLength/maxLength, min/max, regex, and (for `file`) type/size/
 *    count. `crossField` rules are intentionally NOT evaluated here — they need
 *    sibling values.
 *  - `validateFieldInContext(field, values)` additionally evaluates the field's
 *    `crossField` rules against the full values map.
 *  - `validateAll(parsedSchema, values)` runs every field (including nested
 *    subforms, recursively) plus all cross-field rules.
 *
 * Errors are keyed by field id; subform errors use a dotted path
 * (`subformFieldId.<rowIndex>.<childFieldId>`).
 */

import { evaluateOperator } from "./conditionEvaluator";
import { childFields, topLevelFields } from "./fields";
import type {
  AllErrors,
  FieldError,
  FieldSchema,
  FormValues,
  ParsedSchema,
  ValidationRule,
} from "./types";
import { fieldValue, isEmptyValue } from "./values";

function error(rule: string, message: string): FieldError {
  return { rule, message };
}

function valueLength(value: unknown): number | null {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  return null;
}

/** Normalize an allow-list entry: lowercase, trim, strip a leading dot. */
function normalizeType(t: unknown): string {
  return String(t).toLowerCase().trim().replace(/^\./, "");
}

function fileExtension(name: unknown): string {
  if (typeof name !== "string") return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

interface FileLike {
  name?: unknown;
  type?: unknown;
  size?: unknown;
}

function fileMatchesTypes(file: FileLike, allowTypes: string[]): boolean {
  const allowed = allowTypes.map(normalizeType);
  const fileType = file.type == null ? "" : normalizeType(file.type);
  const ext = fileExtension(file.name);
  return allowed.includes(fileType) || allowed.includes(ext);
}

function validateFileField(field: FieldSchema, value: unknown): FieldError[] {
  const errors: FieldError[] = [];
  const files: FileLike[] = Array.isArray(value) ? (value as FileLike[]) : [];

  if (field.maxCount !== undefined && Number.isFinite(field.maxCount) && files.length > field.maxCount) {
    errors.push(error("fileCount", `最多上传 ${field.maxCount} 个文件`));
  }

  if (field.maxSizeMB !== undefined && Number.isFinite(field.maxSizeMB)) {
    const maxBytes = field.maxSizeMB * 1024 * 1024;
    if (files.some((f) => typeof f.size === "number" && f.size > maxBytes)) {
      errors.push(error("fileSize", `文件大小不能超过 ${field.maxSizeMB}MB`));
    }
  }

  if (field.allowTypes && field.allowTypes.length > 0) {
    if (files.some((f) => !fileMatchesTypes(f, field.allowTypes as string[]))) {
      errors.push(error("fileType", "文件类型不允许"));
    }
  }

  return errors;
}

/**
 * Validate a single field's own rules against a single value.
 * Cross-field rules are ignored here (see validateFieldInContext / validateAll).
 */
export function validateField(field: FieldSchema, value: unknown): FieldError[] {
  const errors: FieldError[] = [];

  if (field.required && isEmptyValue(value)) {
    errors.push(error("required", "该字段为必填项"));
  }

  // Remaining rules only make sense for a non-empty value.
  if (isEmptyValue(value)) {
    return errors;
  }

  const rules = field.validation?.rules ?? [];
  for (const rule of rules) {
    switch (rule.type) {
      case "minLength": {
        const len = valueLength(value);
        const min = Number(rule.value);
        if (len !== null && Number.isFinite(min) && len < min) {
          errors.push(error("minLength", rule.message ?? `至少输入 ${min} 个字符`));
        }
        break;
      }
      case "maxLength": {
        const len = valueLength(value);
        const max = Number(rule.value);
        if (len !== null && Number.isFinite(max) && len > max) {
          errors.push(error("maxLength", rule.message ?? `最多输入 ${max} 个字符`));
        }
        break;
      }
      case "min": {
        if (typeof value === "number" && Number.isFinite(Number(rule.value)) && value < Number(rule.value)) {
          errors.push(error("min", rule.message ?? `不能小于 ${rule.value}`));
        }
        break;
      }
      case "max": {
        if (typeof value === "number" && Number.isFinite(Number(rule.value)) && value > Number(rule.value)) {
          errors.push(error("max", rule.message ?? `不能大于 ${rule.value}`));
        }
        break;
      }
      case "regex": {
        if (typeof value === "string" && typeof rule.value === "string") {
          let matches = true;
          try {
            matches = new RegExp(rule.value).test(value);
          } catch {
            matches = true; // invalid pattern in config — skip rather than crash
          }
          if (!matches) {
            errors.push(error("regex", rule.message ?? "格式不正确"));
          }
        }
        break;
      }
      case "crossField":
        // evaluated in validateFieldInContext / validateAll
        break;
      default:
        break;
    }
  }

  if (field.type === "file") {
    errors.push(...validateFileField(field, value));
  }

  return errors;
}

function crossFieldRules(field: FieldSchema): ValidationRule[] {
  return (field.validation?.rules ?? []).filter((r) => r.type === "crossField");
}

function evaluateCrossField(rule: ValidationRule, actual: unknown, other: unknown): boolean {
  // Cross-field rules reuse the condition evaluator's operators so they support
  // the full set (equals/notEquals/contains/greaterThan/lessThan/…).
  if (!rule.operator) return true; // no operator → no violation
  return evaluateOperator(rule.operator, actual, other);
}

function crossFieldErrors(field: FieldSchema, value: unknown, contextValues: FormValues): FieldError[] {
  const errors: FieldError[] = [];
  // Like value rules, cross-field checks only apply to a non-empty value
  // (an empty `end` date should not fail "end > start").
  if (isEmptyValue(value)) return errors;
  for (const rule of crossFieldRules(field)) {
    if (!rule.fieldId) continue;
    if (!evaluateCrossField(rule, value, fieldValue(contextValues, rule.fieldId))) {
      errors.push(error("crossField", rule.message ?? "不满足关联字段校验"));
    }
  }
  return errors;
}

/**
 * Validate a single field's own rules + its cross-field rules against the full
 * values map. Does NOT recurse into subform rows.
 */
export function validateFieldInContext(field: FieldSchema, values: FormValues): FieldError[] {
  const value = fieldValue(values, field.id);
  return [...validateField(field, value), ...crossFieldErrors(field, value, values)];
}

/**
 * Validate a field and (recursively) its subform rows, keyed by dotted paths.
 * Used as the recursive core of validateAll and by FormStateManager for
 * targeted revalidation of a changed subform.
 */
export function validateSubtree(
  field: FieldSchema,
  contextValues: FormValues,
  keyPrefix: string,
  errors: AllErrors,
): void {
  const value = fieldValue(contextValues, field.id);
  const errs = [
    ...validateField(field, value),
    ...crossFieldErrors(field, value, contextValues),
  ];
  if (errs.length) errors[keyPrefix] = errs;

  if (field.type !== "subform") return;
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  rows.forEach((row, i) => {
    for (const child of childFields(field)) {
      validateSubtree(child, row, `${keyPrefix}.${i}.${child.id}`, errors);
    }
  });
}

/**
 * Validate the entire schema against all values, including nested subforms
 * (recursively) and cross-field rules.
 */
export function validateAll(schema: ParsedSchema, values: FormValues): AllErrors {
  const errors: AllErrors = {};
  for (const field of topLevelFields(schema)) {
    validateSubtree(field, values, field.id, errors);
  }
  return errors;
}

/** Top-level fields whose cross-field rule references `fieldId`. */
export function fieldsReferencing(schema: ParsedSchema, fieldId: string): FieldSchema[] {
  return topLevelFields(schema).filter((f) =>
    crossFieldRules(f).some((r) => r.fieldId === fieldId),
  );
}
