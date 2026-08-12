import { FieldWrapper } from "../FieldWrapper";
import { stringValue } from "../coerce";
import type { FieldComponent } from "../types";

export const DatePicker: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  schema,
}) => (
  <FieldWrapper
    id={id}
    label={label}
    required={schema.required}
    helpText={schema.helpText}
    error={error}
  >
    <input
      id={id}
      type="date"
      className="form-control"
      value={stringValue(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      aria-invalid={error?.length ? true : undefined}
      aria-describedby={error?.length ? `${id}-error` : undefined}
    />
  </FieldWrapper>
);
