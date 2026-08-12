/**
 * Domain types for the FormEngine core.
 *
 * These are the semantic authority for the pure-logic modules. They mirror the
 * terminology defined in CONTEXT.md and the design spec (docs/design-spec-form-engine.md).
 * Everything here is plain data — no runtime dependencies.
 */

// ── Fields & schema ─────────────────────────────────────────────────────────

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "datetime",
  "file",
  "subform",
  "user-picker",
  "section",
  "info-text",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface SelectOption {
  label: string;
  value: string;
}

/**
 * Validation rule types expressible in `validation.rules`.
 *
 * `required` is NOT a rule — it is a top-level boolean on `FieldSchema`
 * (see the schema example in the design spec). File constraints (type/size/
 * count) are field config (`allowTypes`/`maxSizeMB`/`maxCount`), not rules.
 */
export const VALIDATION_RULE_TYPES = [
  "minLength",
  "maxLength",
  "min",
  "max",
  "regex",
  "crossField",
] as const;

export type ValidationRuleType = (typeof VALIDATION_RULE_TYPES)[number];

/**
 * A single validation rule. `crossField` rules reference another field via
 * `fieldId` + `operator` (e.g. "end date > start date").
 */
export interface ValidationRule {
  type: ValidationRuleType;
  value?: unknown;
  message?: string;
  /** crossField only — the referenced field id. */
  fieldId?: string;
  /** crossField only — comparison operator against the referenced field. */
  operator?: ConditionOperator;
}

export interface FieldValidation {
  rules: ValidationRule[];
}

export type InfoTextStyle = "info" | "warning" | "danger";

export interface FieldSchema {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: unknown;
  options?: SelectOption[];
  validation?: FieldValidation;
  visibilityCondition?: ConditionNode | null;
  // file
  allowTypes?: string[];
  maxSizeMB?: number;
  maxCount?: number;
  // subform
  subSchema?: SubformSchema;
  // info-text
  styleType?: InfoTextStyle;
  text?: string;
  // user-picker
  multiple?: boolean;
}

export interface SubformSchema {
  fields: FieldSchema[];
}

export interface SectionSchema {
  id: string;
  title: string;
  description?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  visibilityCondition?: ConditionNode | null;
  fields: FieldSchema[];
}

/** The typed intermediate representation produced by SchemaParser. */
export interface ParsedSchema {
  schemaVersion: string;
  sections: SectionSchema[];
  approvalChain?: ApprovalChain;
}

// ── Conditions ──────────────────────────────────────────────────────────────

export const CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "greaterThan",
  "lessThan",
  "isEmpty",
  "isNotEmpty",
  "in",
  "notIn",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** A single atomic condition. */
export interface LeafCondition {
  fieldId: string;
  operator: ConditionOperator;
  value?: unknown;
}

/**
 * A condition group. `type` is optional in the MVP (a bare `{ conditions: [...] }`
 * is implicitly AND). Phase 2 adds explicit AND/OR support; the MVP evaluator
 * rejects `"or"` (see ADR-0006), but the type admits it for forward-compat.
 */
export interface AndCondition {
  type?: "and" | "or";
  conditions: ConditionNode[];
}

export type ConditionNode = LeafCondition | AndCondition;

// ── Values & errors ─────────────────────────────────────────────────────────

export type FormValues = Record<string, unknown>;

export interface FieldError {
  /** The rule/type that failed, e.g. "required", "minLength", "crossField". */
  rule: string;
  /** Human-readable message (Chinese in the MVP). */
  message: string;
}

/**
 * Errors keyed by field id. Nested (subform) errors use a dotted path key,
 * e.g. `"subformFieldId.0.childFieldId"` for row 0 of a subform.
 */
export type AllErrors = Record<string, FieldError[]>;

// ── Approval ────────────────────────────────────────────────────────────────

export const APPROVAL_STATES = [
  "draft",
  "submitted",
  "in_approval",
  "approved",
  "rejected",
  "returned",
  "withdrawn",
] as const;

export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const APPROVAL_ACTION_TYPES = [
  "submit",
  "approve",
  "reject",
  "return",
  "withdraw",
  "transfer",
] as const;

export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export type ApprovalAction =
  | { type: "submit" }
  | { type: "approve"; isFinal: boolean }
  | { type: "reject" }
  | { type: "return" }
  | { type: "withdraw" }
  | { type: "transfer"; targetUserId?: string };

// ── Approver resolution ─────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email?: string;
  departmentId?: string | null;
  managerId?: string | null;
  roles?: string[];
  isActive?: boolean;
}

export type ApproverRule =
  | { type: "org_structure"; relation: "direct_manager" | "department_manager" }
  | { type: "role"; roleId: string }
  | { type: "specific"; userId: string };

export interface ApprovalNode {
  id: string;
  order: number;
  label?: string;
  approverRule: ApproverRule;
}

export interface ApprovalChain {
  nodes: ApprovalNode[];
}

/**
 * Read-only organizational data source. The engine consumes this interface to
 * resolve approvers; it never mutates org data (CONTEXT.md "OrgDataSource").
 *
 * Note: `getUsersByRole` is required for the `role` rule type (design spec §6.4);
 * it was omitted from the §6.6 interface listing, so we include it here.
 */
export interface OrgDataSource {
  getUser(id: string): Promise<User | null>;
  searchUsers(query: string): Promise<User[]>;
  getUserManager(userId: string): Promise<User | null>;
  getUsersByDepartment(departmentId: string): Promise<User[]>;
  getUsersByRole(roleId: string): Promise<User[]>;
}

// ── Form runtime state ──────────────────────────────────────────────────────

export interface FormState {
  values: FormValues;
  errors: AllErrors;
  visibility: Record<string, boolean>;
  disabled: Record<string, boolean>;
  touched: Record<string, boolean>;
  dirty: boolean;
  submitting: boolean;
}

export type FormAction =
  | { type: "SET_VALUE"; fieldId: string; value: unknown }
  | { type: "BLUR"; fieldId: string }
  | { type: "SET_ERRORS"; errors: AllErrors }
  | { type: "SET_DISABLED"; fieldId: string; disabled: boolean }
  | { type: "SET_SUBMITTING"; submitting: boolean }
  | { type: "VALIDATE_ALL" }
  | { type: "RESET" }
  | { type: "RESTORE"; state: FormState };
