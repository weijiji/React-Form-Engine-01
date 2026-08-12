import { FieldWrapper } from "../FieldWrapper";
import { stringArrayValue } from "../coerce";
import type { FieldComponent } from "../types";

export const CheckboxGroup: FieldComponent = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  options,
  schema,
}) => {
  const selected = stringArrayValue(value);

  const toggle = (optionValue: string) => {
    if (selected.includes(optionValue)) {
      onChange(selected.filter((v) => v !== optionValue));
    } else {
      onChange([...selected, optionValue]);
    }
  };

  return (
    <FieldWrapper
      id={id}
      label={label}
      required={schema.required}
      helpText={schema.helpText}
      error={error}
    >
      <div className="form-checkbox-group" role="group" aria-label={label}>
        {options?.map((option) => (
          <label className="form-checkbox" key={option.value}>
            <input
              type="checkbox"
              value={option.value}
              checked={selected.includes(option.value)}
              disabled={disabled}
              onChange={() => toggle(option.value)}
              onBlur={onBlur}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </FieldWrapper>
  );
};
