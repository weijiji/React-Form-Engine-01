import { useMemo, useState } from "react";
import {
  validateAll,
} from "form-engine-core";
import type {
  AllErrors,
  FormValues,
  OrgDataSource,
  ParsedSchema,
} from "form-engine-core";
import { FormEngineContext } from "./context";
import { FormRenderer } from "./FormRenderer";
import "./form.css";
import { definitionKey } from "./paths";
import { useForm } from "./useForm";

function isVisibleErrorKey(
  key: string,
  visibility: Record<string, boolean>,
): boolean {
  return visibility[definitionKey(key)] !== false;
}

function firstVisibleErrorKey(
  errors: AllErrors,
  visibility: Record<string, boolean>,
): string | null {
  for (const [key, errs] of Object.entries(errors)) {
    if (errs.length > 0 && isVisibleErrorKey(key, visibility)) return key;
  }
  return null;
}

function scrollToField(fieldId: string): void {
  // Leaf inputs carry `id`, but radio/checkbox groups, subforms and info text
  // only expose `data-field-id` (or the native group `name`). Fall back so
  // form-level validation can reach any field type.
  const element =
    document.getElementById(fieldId) ??
    document.querySelector(`[data-field-id="${fieldId}"]`) ??
    document.querySelector(`[name="${fieldId}"]`);
  if (!element) return;
  element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  (element as HTMLElement).focus?.();
}

export interface FormProps {
  schema: ParsedSchema;
  initialValues?: FormValues;
  onSubmit?: (values: FormValues) => void | Promise<void>;
  orgDataSource?: OrgDataSource | null;
  submitLabel?: string;
}

/**
 * Form — the top-level filling surface. Wires the engine reducer to the
 * renderer, provides the org data source, and owns submission:
 *
 *  - the submit button is hard-disabled only while `submitting` (preventing
 *    double submits); while the form is invalid it stays clickable so a click
 *    triggers form-level validation + scroll-to-first-error instead of
 *    submitting — submission stays gated until every visible field passes. The
 *    invalid styling + hint surface only after a submit attempt, so a pristine
 *    form doesn't warn about untouched required fields.
 */
export function Form({
  schema,
  initialValues = {},
  onSubmit,
  orgDataSource = null,
  submitLabel = "提交",
}: FormProps) {
  const { state, dispatch, setSubmitting } = useForm(schema, initialValues);
  const [attempted, setAttempted] = useState(false);

  const hasErrors = useMemo(() => {
    const errors = validateAll(schema, state.values);
    return firstVisibleErrorKey(errors, state.visibility) !== null;
  }, [schema, state.values, state.visibility]);

  const handleSubmit = async () => {
    const errors = validateAll(schema, state.values);
    const firstKey = firstVisibleErrorKey(errors, state.visibility);
    if (firstKey !== null) {
      // Surface the failures in the UI (visibility-filtered) and jump to the first.
      setAttempted(true);
      dispatch({ type: "VALIDATE_ALL" });
      scrollToField(firstKey);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit?.(state.values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormEngineContext.Provider value={{ orgDataSource }}>
      <form className="form-engine" noValidate>
        <FormRenderer schema={schema} state={state} dispatch={dispatch} />
        <div className="form-actions">
          <button
            type="button"
            className={
              attempted && hasErrors
                ? "form-submit form-submit--invalid"
                : "form-submit"
            }
            disabled={state.submitting}
            onClick={() => void handleSubmit()}
          >
            {state.submitting ? "提交中…" : submitLabel}
          </button>
          {attempted && hasErrors && !state.submitting && (
            <p className="form-submit-hint">请先完成所有必填项</p>
          )}
        </div>
      </form>
    </FormEngineContext.Provider>
  );
}
