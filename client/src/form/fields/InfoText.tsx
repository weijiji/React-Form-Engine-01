import type { InfoTextStyle } from "form-engine-core";
import type { FieldComponent } from "../types";

const STYLES: Record<InfoTextStyle, string> = {
  info: "form-info--info",
  warning: "form-info--warning",
  danger: "form-info--danger",
};

/**
 * InfoText — static informational text with info/warning/danger styling.
 * Visibility is handled upstream by the renderer via `visibilityCondition`.
 */
export const InfoText: FieldComponent = ({ id, schema }) => {
  const style: InfoTextStyle = schema.styleType ?? "info";
  const content = schema.text ?? schema.label;
  return (
    <div
      className={`form-info ${STYLES[style]}`}
      data-field-id={id}
      role={style === "danger" ? "alert" : undefined}
    >
      {content}
    </div>
  );
};
