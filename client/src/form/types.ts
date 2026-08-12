import type { ComponentType } from "react";
import type {
  FieldError,
  FieldSchema,
  FieldValidation,
  SelectOption,
} from "form-engine-core";

/**
 * The uniform props contract every field component receives (design spec §2.1.5).
 *
 * The registry's ComponentFactory injects these from the parsed schema + runtime
 * state; leaf components must not reach back into the engine on their own.
 *
 * Note: `error` is `FieldError[]` (not a single `FieldError` as the prose spec
 * sketches) because the engine's `AllErrors` map keys each field to an array of
 * failures — e.g. a field can violate both `required` and `minLength`. Components
 * surface the first message and rely on `error.length` for the error styling.
 */
export interface FieldComponentProps {
  id: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  error?: FieldError[];
  disabled: boolean;
  placeholder?: string;
  options?: SelectOption[];
  validation?: FieldValidation;
  /** The complete field config — components may read any field-specific option. */
  schema: FieldSchema;
}

export type FieldComponent = ComponentType<FieldComponentProps>;
