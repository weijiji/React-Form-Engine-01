import { FieldWrapper } from "../FieldWrapper";
import type { FieldComponent } from "../types";

export const RadioGroup: FieldComponent = ({
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
    <div className="form-radio-group" role="radiogroup" aria-label={label}>
      {options?.map((option) => (
        <label className="form-radio" key={option.value}>
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            onBlur={onBlur}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </FieldWrapper>
);
