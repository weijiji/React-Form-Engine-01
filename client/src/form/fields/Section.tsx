import { useState } from "react";
import type { ReactNode } from "react";
import type { SectionSchema } from "form-engine-core";
import type { FieldComponent } from "../types";

export interface SectionProps {
  section: SectionSchema;
  children: ReactNode;
}

/**
 * Section — the collapsible container rendered for each top-level `SectionSchema`
 * by FormRenderer. Collapse state is local and defaults from `defaultCollapsed`.
 */
export function Section({ section, children }: SectionProps) {
  const collapsible = section.collapsible ?? false;
  const [collapsed, setCollapsed] = useState(section.defaultCollapsed ?? false);

  return (
    <section className="form-section" data-section-id={section.id}>
      <header className="form-section-header">
        <h2 className="form-section-title">{section.title}</h2>
        {section.description && (
          <p className="form-section-desc">{section.description}</p>
        )}
        {collapsible && (
          <button
            type="button"
            className="form-section-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-expanded={!collapsed}
          >
            {collapsed ? "展开" : "折叠"}
          </button>
        )}
      </header>
      {!collapsed && <div className="form-section-body">{children}</div>}
    </section>
  );
}

/**
 * SectionField — the `section` *field type*. The MVP IR carries nested section
 * content only at the top level (`ParsedSchema.sections`), so a `section` field
 * renders as a labelled grouping header with no children. Nested section content
 * is a future schema extension.
 */
export const SectionField: FieldComponent = ({ id, label, error, schema }) => (
  <div className="form-section form-section--field" data-section-id={id}>
    <h3 className="form-section-title">{label}</h3>
    {schema.helpText && <p className="form-help">{schema.helpText}</p>}
    {error && error.length > 0 && (
      <p className="form-error" role="alert">
        {error[0].message}
      </p>
    )}
  </div>
);
