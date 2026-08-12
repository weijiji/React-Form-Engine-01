import { FieldWrapper } from "../FieldWrapper";
import { stringValue } from "../coerce";
import type { FieldComponent } from "../types";

export const TextInput: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  placeholder,
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
      type="text"
      className="form-control"
      value={stringValue(value)}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      aria-invalid={error?.length ? true : undefined}
      aria-describedby={error?.length ? `${id}-error` : undefined}
    />
  </FieldWrapper>
);
