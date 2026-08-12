/**
 * FormStateManager — the reducer that drives a single form instance's runtime
 * state: values / errors / visibility / disabled / touched / dirty / submitting.
 *
 * Design (docs/design-spec §2.1.2 & §5.3):
 *   setValue → update values → recompute visibility (incremental, via the
 *   dependency graph) → recompute errors. `touched` is only set true on BLUR
 *   (onBlur). `dirty` marks unsaved changes. RESET/RESTORE recover state.
 */

import { topLevelFields } from "./fields";
import type {
  AllErrors,
  FormAction,
  FormState,
  FormValues,
  ParsedSchema,
} from "./types";
import {
  fieldsReferencing,
  validateAll,
  validateFieldInContext,
  validateSubtree,
} from "./validationEngine";
import { computeVisibility, recalculateVisibility } from "./visibilityEngine";

export function createInitialState(
  schema: ParsedSchema,
  initialValues: FormValues = {},
): FormState {
  return {
    values: { ...initialValues },
    errors: {},
    visibility: computeVisibility(schema, initialValues),
    disabled: {},
    touched: {},
    dirty: false,
    submitting: false,
  };
}

/** Remove error entries for `prefix` and its dotted descendants. */
function clearSubtree(errors: AllErrors, prefix: string): void {
  delete errors[prefix];
  const dot = `${prefix}.`;
  for (const key of Object.keys(errors)) {
    if (key.startsWith(dot)) delete errors[key];
  }
}

/** The definition-level key for an error key (strips row indexes). */
function definitionKey(key: string): string {
  return key
    .split(".")
    .filter((part) => !/^\d+$/.test(part))
    .join(".");
}

function isVisibleErrorKey(key: string, visibility: Record<string, boolean>): boolean {
  return visibility[definitionKey(key)] !== false;
}

/** Revalidate a field's subtree plus any cross-field dependents. Mutates `errors`. */
function revalidateField(
  errors: AllErrors,
  schema: ParsedSchema,
  values: FormValues,
  visibility: Record<string, boolean>,
  fieldId: string,
): void {
  const field = topLevelFields(schema).find((f) => f.id === fieldId);
  if (field) {
    clearSubtree(errors, fieldId);
    if (visibility[fieldId] !== false) {
      validateSubtree(field, values, fieldId, errors);
    }
  }

  for (const dep of fieldsReferencing(schema, fieldId)) {
    delete errors[dep.id];
    if (visibility[dep.id] !== false) {
      const errs = validateFieldInContext(dep, values);
      if (errs.length) errors[dep.id] = errs;
    }
  }
}

function filterVisibleErrors(
  errors: AllErrors,
  visibility: Record<string, boolean>,
): AllErrors {
  const out: AllErrors = {};
  for (const [key, errs] of Object.entries(errors)) {
    if (isVisibleErrorKey(key, visibility)) out[key] = errs;
  }
  return out;
}

/**
 * Create a reducer bound to a parsed schema.
 *
 * @param schema        the parsed schema (from SchemaParser)
 * @param initialValues initial field values (e.g. defaults, or a restored draft)
 */
export function createFormReducer(schema: ParsedSchema, initialValues: FormValues = {}) {
  return function formReducer(state: FormState | undefined, action: FormAction): FormState {
    const current = state ?? createInitialState(schema, initialValues);

    switch (action.type) {
      case "SET_VALUE": {
        if (Object.is(current.values[action.fieldId], action.value)) {
          return current;
        }
        const values = { ...current.values, [action.fieldId]: action.value };
        const { visibility, affected } = recalculateVisibility(
          schema,
          values,
          action.fieldId,
          current.visibility,
        );
        const errors: AllErrors = { ...current.errors };
        for (const id of affected) {
          if (visibility[id] === false) clearSubtree(errors, id);
        }
        revalidateField(errors, schema, values, visibility, action.fieldId);
        return { ...current, values, visibility, errors, dirty: true };
      }

      case "BLUR": {
        const touched = { ...current.touched, [action.fieldId]: true };
        const errors: AllErrors = { ...current.errors };
        revalidateField(errors, schema, current.values, current.visibility, action.fieldId);
        return { ...current, touched, errors };
      }

      case "SET_ERRORS":
        return { ...current, errors: action.errors };

      case "SET_DISABLED":
        return {
          ...current,
          disabled: { ...current.disabled, [action.fieldId]: action.disabled },
        };

      case "SET_SUBMITTING":
        return { ...current, submitting: action.submitting };

      case "VALIDATE_ALL": {
        const errors = filterVisibleErrors(validateAll(schema, current.values), current.visibility);
        return { ...current, errors };
      }

      case "RESET":
        return createInitialState(schema, initialValues);

      case "RESTORE":
        return action.state;
    }
  };
}

/**
 * Thin imperative wrapper around the reducer — convenient for non-React
 * consumers and tests. Mirrors the design spec's core methods.
 */
export class FormStateManager {
  private state: FormState;
  private reducer: (state: FormState, action: FormAction) => FormState;

  constructor(schema: ParsedSchema, initialValues: FormValues = {}) {
    this.reducer = createFormReducer(schema, initialValues) as (
      state: FormState,
      action: FormAction,
    ) => FormState;
    this.state = createInitialState(schema, initialValues);
  }

  getState(): FormState {
    return this.state;
  }

  getValue(fieldId: string): unknown {
    return this.state.values[fieldId];
  }

  dispatch(action: FormAction): FormState {
    this.state = this.reducer(this.state, action);
    return this.state;
  }

  setValue(fieldId: string, value: unknown): FormState {
    return this.dispatch({ type: "SET_VALUE", fieldId, value });
  }

  blur(fieldId: string): FormState {
    return this.dispatch({ type: "BLUR", fieldId });
  }

  setErrors(errors: AllErrors): FormState {
    return this.dispatch({ type: "SET_ERRORS", errors });
  }

  validateAll(): FormState {
    return this.dispatch({ type: "VALIDATE_ALL" });
  }

  setSubmitting(submitting: boolean): FormState {
    return this.dispatch({ type: "SET_SUBMITTING", submitting });
  }

  reset(): FormState {
    return this.dispatch({ type: "RESET" });
  }

  restore(state: FormState): FormState {
    return this.dispatch({ type: "RESTORE", state });
  }
}
