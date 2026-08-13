import { useCallback, useMemo } from "react";
import type { Dispatch } from "react";
import type {
  FieldSchema,
  FormAction,
  FormState,
  ParsedSchema,
} from "form-engine-core";
import { FormRenderContext } from "./context";
import { Section } from "./fields/Section";
import { definitionKey, getValueAtPath, setValueAtPath } from "./paths";
import { ComponentFactory } from "./registry";

export interface FormRendererProps {
  schema: ParsedSchema;
  state: FormState;
  dispatch: Dispatch<FormAction>;
  /** Render every field disabled (used by the designer's read-only preview). */
  readOnly?: boolean;
}

/**
 * FormRenderer — recursively renders a parsed schema: visible sections → visible
 * fields → (for subforms) row-indexed child fields. Subform children are edited
 * by rewriting their top-level array and dispatching SET_VALUE on the top-level
 * field, which keeps the engine's targeted revalidation intact.
 */
export function FormRenderer({
  schema,
  state,
  dispatch,
  readOnly = false,
}: FormRendererProps) {
  const renderField = useCallback(
    (field: FieldSchema, path: string): React.ReactNode => {
      // Visibility is per *definition* (no row index), unlike errors/values.
      if (state.visibility[definitionKey(path)] === false) return null;

      const value = getValueAtPath(state.values, path);
      const rootId = path.split(".")[0];

      return (
        <ComponentFactory
          key={path}
          field={field}
          id={path}
          value={value}
          error={state.errors[path]}
          disabled={readOnly || state.disabled[path] === true}
          onChange={(next) => {
            const values = setValueAtPath(state.values, path, next);
            dispatch({ type: "SET_VALUE", fieldId: rootId, value: values[rootId] });
          }}
          onBlur={() => dispatch({ type: "BLUR", fieldId: rootId })}
        />
      );
    },
    [state, dispatch, readOnly],
  );

  const contextValue = useMemo(
    () => ({ state, dispatch, renderField }),
    [state, dispatch, renderField],
  );

  return (
    <FormRenderContext.Provider value={contextValue}>
      {schema.sections.map((section) => {
        if (state.visibility[section.id] === false) return null;
        return (
          <Section key={section.id} section={section}>
            {section.fields.map((field) => renderField(field, field.id))}
          </Section>
        );
      })}
    </FormRenderContext.Provider>
  );
}
