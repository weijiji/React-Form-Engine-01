import { FieldWrapper } from "../FieldWrapper";
import { stringValue } from "../coerce";
import type { FieldComponent } from "../types";

export const TextArea: FieldComponent = ({
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
    <textarea
      id={id}
      className="form-control"
      rows={3}
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
