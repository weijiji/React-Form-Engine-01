import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "default" | "primary" | "ghost";
export type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered before children at 16px — the old `.btn .icon` slot. */
  icon?: ReactNode;
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: "",
  sm: styles.sm,
  lg: styles.lg,
};

export const Button: React.FC<ButtonProps> = ({
  variant = "default",
  size = "default",
  icon,
  type = "button",
  className,
  children,
  ...rest
}) => (
  <button
    type={type}
    className={[
      styles.btn,
      variant === "primary" ? styles.primary : "",
      variant === "ghost" ? styles.ghost : "",
      SIZE_CLASS[size],
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...rest}
  >
    {icon && <span className={styles.icon}>{icon}</span>}
    {children}
  </button>
);
