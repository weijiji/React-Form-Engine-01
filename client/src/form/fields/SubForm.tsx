import { useContext } from "react";
import type { FieldSchema } from "form-engine-core";
import { FormRenderContext } from "../context";
import { objectArrayValue } from "../coerce";
import type { FieldComponent } from "../types";

function defaultRow(fields: FieldSchema[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) row[field.id] = field.defaultValue;
  }
  return row;
}

/**
 * SubForm — a repeatable group of child fields. Rows are stored as an array of
 * row objects on the parent value; add/remove rewrites the array through the
 * contract's `onChange`, and each child field is rendered recursively via
 * `renderField` (from FormRenderContext) with a row-indexed path.
 */
export const SubForm: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  schema,
}) => {
  const context = useContext(FormRenderContext);
  const rows = objectArrayValue(value);
  const childFields = schema.subSchema?.fields ?? [];

  const addRow = () => {
    onChange([...rows, defaultRow(childFields)]);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="form-field form-subform" data-field-id={id}>
      <div className="form-label">
        {label}
        {schema.required && (
          <span className="form-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </div>
      {error && error.length > 0 && (
        <p className="form-error" role="alert">
          {error[0].message}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="form-help">暂无记录</p>
      ) : (
        <div className="subform-rows">
          {rows.map((_, rowIndex) => (
            <div className="subform-row" key={rowIndex}>
              <div className="subform-row-fields">
                {childFields.map((field) =>
                  context?.renderField(field, `${id}.${rowIndex}.${field.id}`),
                )}
              </div>
              <button
                type="button"
                className="subform-remove"
                onClick={() => removeRow(rowIndex)}
                disabled={disabled}
                aria-label={`删除第 ${rowIndex + 1} 行`}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="subform-add"
        onClick={addRow}
        disabled={disabled}
      >
        添加一行
      </button>
    </div>
  );
};
