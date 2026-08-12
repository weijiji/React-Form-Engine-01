import { FieldWrapper } from "../FieldWrapper";
import { stringValue } from "../coerce";
import type { FieldComponent } from "../types";

export const Select: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  options,
  schema,
}) => (
  <FieldWrapper
    id={id}
    label={label}
    required={schema.required}
    helpText={schema.helpText}
    error={error}
  >
    <select
      id={id}
      className="form-control"
      value={stringValue(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      aria-invalid={error?.length ? true : undefined}
      aria-describedby={error?.length ? `${id}-error` : undefined}
    >
      <option value="">请选择</option>
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </FieldWrapper>
);
