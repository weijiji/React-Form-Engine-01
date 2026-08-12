import { useCallback, useMemo, useReducer } from "react";
import type { Reducer } from "react";
import {
  createFormReducer,
  createInitialState,
} from "form-engine-core";
import type {
  FormAction,
  FormState,
  FormValues,
  ParsedSchema,
} from "form-engine-core";

/**
 * React binding for the engine's FormStateManager reducer. Exposes the live
 * `FormState` plus small convenience dispatchers so callers rarely touch raw
 * actions.
 */
export function useForm(schema: ParsedSchema, initialValues: FormValues = {}) {
  const reducer = useMemo(
    () => createFormReducer(schema, initialValues),
    [schema, initialValues],
  );

  const [state, dispatch] = useReducer(
    reducer as Reducer<FormState, FormAction>,
    createInitialState(schema, initialValues),
  );

  const setValue = useCallback(
    (fieldId: string, value: unknown) =>
      dispatch({ type: "SET_VALUE", fieldId, value }),
    [],
  );

  const blur = useCallback(
    (fieldId: string) => dispatch({ type: "BLUR", fieldId }),
    [],
  );

  const setSubmitting = useCallback(
    (submitting: boolean) => dispatch({ type: "SET_SUBMITTING", submitting }),
    [],
  );

  const validateAll = useCallback(
    () => dispatch({ type: "VALIDATE_ALL" }),
    [],
  );

  return { state, dispatch, setValue, blur, setSubmitting, validateAll };
}
