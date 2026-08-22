/**
 * SchemaParser — validates raw JSON and produces a typed ParsedSchema IR.
 *
 * Validation performed (per issue 02):
 *  - `schemaVersion` must be present and supported (major version 1)
 *  - schema structure must be legal (sections[] of valid sections/fields)
 *  - every `fieldType` must be recognizable
 *  - subform nesting depth ≤ 2 (a subform inside a grand-child subform is rejected)
 *  - approval chain (when supplied) must be complete and well-formed
 *
 * Rejections throw a typed {@link SchemaParseError} with a machine-readable code.
 */

import {
  CONDITION_OPERATORS,
  FIELD_TYPES,
  VALIDATION_RULE_TYPES,
  type ApprovalChain,
  type ApprovalNode,
  type ApproverRule,
  type ConditionNode,
  type ConditionOperator,
  type FieldSchema,
  type FieldType,
  type FieldValidation,
  type ParsedSchema,
  type SectionSchema,
  type ValidationRule,
} from "./types";

export type SchemaParseErrorCode =
  | "SCHEMA_VERSION_MISSING"
  | "SCHEMA_VERSION_UNKNOWN"
  | "SCHEMA_STRUCTURE_INVALID"
  | "FIELD_TYPE_UNKNOWN"
  | "SUBFORM_NESTING_TOO_DEEP"
  | "APPROVAL_CHAIN_INVALID";

export class SchemaParseError extends Error {
  readonly code: SchemaParseErrorCode;
  readonly path: string;

  constructor(code: SchemaParseErrorCode, message: string, path = "$") {
    super(`${message} (at ${path})`);
    this.name = "SchemaParseError";
    this.code = code;
    this.path = path;
  }
}

/** Maximum nesting depth for subforms (主表单 → 子表单 → 孙表单 = 2 levels). */
export const MAX_SUBFORM_DEPTH = 2;

/** Supported schema major version (see ADR-0005: same-major accepted). */
export const SUPPORTED_SCHEMA_MAJOR = "1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupportedSchemaVersion(version: string): boolean {
  const major = version.split(".")[0];
  return major === SUPPORTED_SCHEMA_MAJOR;
}

function requireString(
  value: unknown,
  path: string,
  what: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", `${what} must be a non-empty string`, path);
  }
  return value;
}

function optionalString(value: unknown, path: string, what: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", `${what} must be a string`, path);
  }
  return value;
}

function optionalBoolean(value: unknown, path: string, what: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", `${what} must be a boolean`, path);
  }
  return value;
}

// ── Conditions ──────────────────────────────────────────────────────────────

function parseCondition(value: unknown, path: string): ConditionNode {
  if (Array.isArray(value)) {
    // A bare array is an implicit AND group.
    return {
      conditions: value.map((c, i) => parseCondition(c, `${path}[${i}]`)),
    };
  }
  if (!isObject(value)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "visibilityCondition must be an object or array", path);
  }

  if (Array.isArray(value.conditions)) {
    const type = value.type;
    if (type !== undefined && type !== "and") {
      throw new SchemaParseError(
        "SCHEMA_STRUCTURE_INVALID",
        `condition group type "${String(type)}" is not supported in the MVP`,
        path,
      );
    }
    return {
      ...(type === "and" ? { type: "and" as const } : {}),
      conditions: (value.conditions as unknown[]).map((c, i) => parseCondition(c, `${path}.conditions[${i}]`)),
    };
  }

  if (typeof value.fieldId !== "string" || value.fieldId === "") {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "condition must have a string fieldId", path);
  }
  if (typeof value.operator !== "string" || !(CONDITION_OPERATORS as readonly string[]).includes(value.operator)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", `unknown condition operator "${String(value.operator)}"`, path);
  }
  return {
    fieldId: value.fieldId,
    operator: value.operator as ConditionOperator,
    ...(value.value !== undefined ? { value: value.value } : {}),
  };
}

function parseVisibilityCondition(value: unknown, path: string): ConditionNode | null | undefined {
  if (value === undefined || value === null) return null;
  return parseCondition(value, path);
}

// ── Validation rules ────────────────────────────────────────────────────────

function parseValidationRules(value: unknown, path: string): FieldValidation | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "validation must be an object", path);
  }
  const rules = value.rules;
  if (rules === undefined || rules === null) return undefined;
  if (!Array.isArray(rules)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "validation.rules must be an array", path);
  }
  return {
    rules: rules.map((r, i) => {
      if (!isObject(r)) {
        throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "validation rule must be an object", `${path}.rules[${i}]`);
      }
      const type = r.type;
      if (typeof type !== "string" || !(VALIDATION_RULE_TYPES as readonly string[]).includes(type)) {
        throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", `unknown validation rule type "${String(type)}"`, `${path}.rules[${i}]`);
      }
      const rule: ValidationRule = { type: type as ValidationRule["type"] };
      if (r.value !== undefined) rule.value = r.value;
      if (r.message !== undefined) rule.message = optionalString(r.message, `${path}.rules[${i}]`, "message");
      if (r.fieldId !== undefined) rule.fieldId = optionalString(r.fieldId, `${path}.rules[${i}]`, "fieldId");
      if (r.operator !== undefined) {
        const op = optionalString(r.operator, `${path}.rules[${i}]`, "operator");
        if (op && (CONDITION_OPERATORS as readonly string[]).includes(op)) {
          rule.operator = op as ValidationRule["operator"];
        }
      }
      return rule;
    }),
  };
}

// ── Fields ──────────────────────────────────────────────────────────────────

function parseField(value: unknown, path: string, depth: number): FieldSchema {
  if (!isObject(value)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "field must be an object", path);
  }

  const id = requireString(value.id, path, "field.id");
  const type = requireString(value.type, path, "field.type");
  if (!(FIELD_TYPES as readonly string[]).includes(type)) {
    throw new SchemaParseError("FIELD_TYPE_UNKNOWN", `unknown fieldType "${type}"`, path);
  }
  const label = requireString(value.label, path, "field.label");

  const field: FieldSchema = {
    id,
    type: type as FieldType,
    label,
    required: optionalBoolean(value.required, path, "field.required"),
  };

  field.placeholder = optionalString(value.placeholder, path, "placeholder");
  field.helpText = optionalString(value.helpText, path, "helpText");
  field.defaultValue = value.defaultValue;

  if (value.options !== undefined && value.options !== null) {
    if (!Array.isArray(value.options)) {
      throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "field.options must be an array", path);
    }
    field.options = value.options.map((o, i) => {
      if (!isObject(o) || typeof o.label !== "string" || typeof o.value !== "string") {
        throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "option must have string label and value", `${path}.options[${i}]`);
      }
      return { label: o.label, value: o.value };
    });
  }

  field.validation = parseValidationRules(value.validation, path);
  field.visibilityCondition = parseVisibilityCondition(value.visibilityCondition, path);

  // file
  field.allowTypes = value.allowTypes as string[] | undefined;
  field.maxSizeMB = value.maxSizeMB as number | undefined;
  field.maxCount = value.maxCount as number | undefined;

  // info-text (static text content)
  if (value.styleType !== undefined) {
    const st = optionalString(value.styleType, path, "styleType");
    if (st === "info" || st === "warning" || st === "danger") field.styleType = st;
  }
  field.text = optionalString(value.text, path, "text");

  // user-picker
  field.multiple = value.multiple === undefined ? undefined : Boolean(value.multiple);

  // subform
  if (type === "subform") {
    if (depth >= MAX_SUBFORM_DEPTH) {
      throw new SchemaParseError(
        "SUBFORM_NESTING_TOO_DEEP",
        `subform nesting exceeds maximum depth of ${MAX_SUBFORM_DEPTH}`,
        path,
      );
    }
    const subSchema = value.subSchema;
    if (!isObject(subSchema) || !Array.isArray(subSchema.fields)) {
      throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "subform requires subSchema.fields array", path);
    }
    field.subSchema = {
      fields: (subSchema.fields as unknown[]).map((f, i) =>
        parseField(f, `${path}.subSchema.fields[${i}]`, depth + 1),
      ),
    };
  }

  return field;
}

// ── Sections ────────────────────────────────────────────────────────────────

function parseSection(value: unknown, path: string): SectionSchema {
  if (!isObject(value)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "section must be an object", path);
  }
  const id = requireString(value.id, path, "section.id");
  const title = requireString(value.title, path, "section.title");

  const section: SectionSchema = { id, title, fields: [] };

  section.description = optionalString(value.description, path, "description");
  section.collapsible = value.collapsible === undefined ? undefined : Boolean(value.collapsible);
  section.defaultCollapsed = value.defaultCollapsed === undefined ? undefined : Boolean(value.defaultCollapsed);
  section.visibilityCondition = parseVisibilityCondition(value.visibilityCondition, path);

  if (!Array.isArray(value.fields)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "section.fields must be an array", path);
  }
  section.fields = (value.fields as unknown[]).map((f, i) => parseField(f, `${path}.fields[${i}]`, 0));

  return section;
}

// ── Approval chain ──────────────────────────────────────────────────────────

function parseApproverRule(value: unknown, path: string): ApproverRule {
  if (!isObject(value)) {
    throw new SchemaParseError("APPROVAL_CHAIN_INVALID", "approverRule must be an object", path);
  }
  const type = value.type;
  if (type === "org_structure") {
    const relation = value.relation;
    if (relation !== "direct_manager" && relation !== "department_manager") {
      throw new SchemaParseError("APPROVAL_CHAIN_INVALID", "org_structure rule requires relation", path);
    }
    return { type: "org_structure", relation };
  }
  if (type === "role") {
    const roleId = requireString(value.roleId, path, "role.roleId");
    return { type: "role", roleId };
  }
  if (type === "specific") {
    const userId = requireString(value.userId, path, "specific.userId");
    return { type: "specific", userId };
  }
  throw new SchemaParseError("APPROVAL_CHAIN_INVALID", `unknown approver rule type "${String(type)}"`, path);
}

function parseApprovalChain(value: unknown, path: string): ApprovalChain {
  if (!isObject(value) || !Array.isArray(value.nodes)) {
    throw new SchemaParseError("APPROVAL_CHAIN_INVALID", "approvalChain must have a nodes array", path);
  }
  if (value.nodes.length === 0) {
    throw new SchemaParseError("APPROVAL_CHAIN_INVALID", "approvalChain.nodes must not be empty", path);
  }

  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();

  const nodes: ApprovalNode[] = (value.nodes as unknown[]).map((n, i) => {
    const nodePath = `${path}.nodes[${i}]`;
    if (!isObject(n)) {
      throw new SchemaParseError("APPROVAL_CHAIN_INVALID", "approval node must be an object", nodePath);
    }
    const id = requireString(n.id, nodePath, "node.id");
    if (seenIds.has(id)) {
      throw new SchemaParseError("APPROVAL_CHAIN_INVALID", `duplicate node id "${id}"`, nodePath);
    }
    seenIds.add(id);

    const order = n.order;
    // `order` is the 1-based position in the chain (BUG-13): it flows verbatim
    // into `approval_records.node_order` and the execution guard compares
    // `node_order - 1` against the 0-based `current_node_index`. A 0-based or
    // fractional order would silently break every approval action, so reject it
    // here rather than let it pass through to execution.
    if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
      throw new SchemaParseError(
        "APPROVAL_CHAIN_INVALID",
        "node.order must be an integer >= 1 (1-based position in the chain)",
        nodePath,
      );
    }
    if (seenOrders.has(order)) {
      throw new SchemaParseError("APPROVAL_CHAIN_INVALID", `duplicate node order ${order}`, nodePath);
    }
    seenOrders.add(order);

    return {
      id,
      order,
      ...(n.label !== undefined ? { label: optionalString(n.label, nodePath, "label") } : {}),
      approverRule: parseApproverRule(n.approverRule, `${nodePath}.approverRule`),
    };
  });

  // Deterministic order for the IR.
  nodes.sort((a, b) => a.order - b.order);

  return { nodes };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Parse a raw schema (and optional approval chain) into a typed IR.
 *
 * @param rawSchema  the raw `schema` JSONB value
 * @param approvalChain  the raw `approval_chain` JSONB value (optional; validated when present)
 */
export function parseSchema(rawSchema: unknown, approvalChain?: unknown): ParsedSchema {
  if (!isObject(rawSchema)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "schema must be an object", "$");
  }

  const version = rawSchema.schemaVersion;
  if (typeof version !== "string" || version.trim() === "") {
    throw new SchemaParseError("SCHEMA_VERSION_MISSING", "schemaVersion is required", "$");
  }
  if (!isSupportedSchemaVersion(version)) {
    throw new SchemaParseError("SCHEMA_VERSION_UNKNOWN", `unsupported schemaVersion "${version}"`, "$");
  }

  if (!Array.isArray(rawSchema.sections)) {
    throw new SchemaParseError("SCHEMA_STRUCTURE_INVALID", "schema.sections must be an array", "$");
  }

  const parsed: ParsedSchema = {
    schemaVersion: version,
    sections: (rawSchema.sections as unknown[]).map((s, i) => parseSection(s, `$.sections[${i}]`)),
  };

  if (approvalChain !== undefined && approvalChain !== null) {
    parsed.approvalChain = parseApprovalChain(approvalChain, "$");
  }

  return parsed;
}
