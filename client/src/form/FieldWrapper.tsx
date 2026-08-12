import type { FieldError } from "form-engine-core";
import type { ReactNode } from "react";

export interface FieldWrapperProps {
  id: string;
  label: string;
  required: boolean;
  helpText?: string;
  error?: FieldError[];
  children: ReactNode;
}

/**
 * Shared chrome for a single field: label, required marker, control slot, help
 * text and error message. Applies the error styling class so CSS can paint the
 * control's red border without each component repeating it.
 */
export function FieldWrapper({
  id,
  label,
  required,
  helpText,
  error,
  children,
}: FieldWrapperProps) {
  const message = error && error.length > 0 ? error[0].message : undefined;
  const className = message ? "form-field form-field--error" : "form-field";

  return (
    <div className={className} data-field-id={id}>
      <label className="form-label" htmlFor={id}>
        {label}
        {required && (
          <span className="form-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {helpText && <p className="form-help">{helpText}</p>}
      {message && (
        <p className="form-error" role="alert" id={`${id}-error`}>
          {message}
        </p>
      )}
    </div>
  );
}
