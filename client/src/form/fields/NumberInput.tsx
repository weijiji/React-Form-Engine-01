import { FieldWrapper } from "../FieldWrapper";
import { numberValue, parseNumberInput } from "../coerce";
import type { FieldComponent } from "../types";

export const NumberInput: FieldComponent = ({
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
      type="number"
      className="form-control"
      value={numberValue(value)}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(parseNumberInput(e.target.value))}
      onBlur={onBlur}
      aria-invalid={error?.length ? true : undefined}
      aria-describedby={error?.length ? `${id}-error` : undefined}
    />
  </FieldWrapper>
);
