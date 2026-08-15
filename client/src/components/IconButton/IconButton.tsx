import type { ButtonHTMLAttributes } from "react";
import styles from "./IconButton.module.css";

export type IconButtonSize = "md" | "sm" | "xs";
export type IconButtonVariant = "default" | "danger";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /** Pressed/toggled state (e.g. an open menu trigger). */
  active?: boolean;
  /** Accessible name — rendered as both `aria-label` and `title`. */
  label: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  size = "md",
  variant = "default",
  active = false,
  label,
  type = "button",
  className,
  children,
  ...rest
}) => (
  <button
    type={type}
    title={label}
    aria-label={label}
    className={[
      styles["icon-btn"],
      size === "sm" ? styles.sm : "",
      size === "xs" ? styles.xs : "",
      variant === "danger" ? styles.danger : "",
      active ? styles.active : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...rest}
  >
    {children}
  </button>
);
