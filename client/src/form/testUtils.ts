import { vi } from "vitest";
import type { FieldSchema } from "form-engine-core";
import type { FieldComponentProps } from "./types";

/** Build a minimal field schema, overridable per test. */
export function field(overrides: Partial<FieldSchema> = {}): FieldSchema {
  return {
    id: "f1",
    type: "text",
    label: "字段",
    required: false,
    ...overrides,
  };
}

/** Build a full FieldComponentProps, with no-op/spied defaults. */
export function fieldProps(
  schema: FieldSchema,
  overrides: Partial<FieldComponentProps> = {},
): FieldComponentProps {
  return {
    id: schema.id,
    label: schema.label,
    value: undefined,
    onChange: vi.fn(),
    onBlur: vi.fn(),
    error: undefined,
    disabled: false,
    placeholder: schema.placeholder,
    options: schema.options,
    validation: schema.validation,
    schema,
    ...overrides,
  };
}
