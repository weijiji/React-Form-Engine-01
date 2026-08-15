import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeColor = "green" | "amber" | "gray" | "indigo";

export interface BadgeProps {
  color: BadgeColor;
  /** Shows a small leading status dot (the old `.badge .dot`). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const COLOR_CLASS: Record<BadgeColor, string> = {
  green: styles.green,
  amber: styles.amber,
  gray: styles.gray,
  indigo: styles.indigo,
};

export const Badge: React.FC<BadgeProps> = ({
  color,
  dot = false,
  children,
  className,
}) => (
  <span
    className={[styles.badge, COLOR_CLASS[color], className]
      .filter(Boolean)
      .join(" ")}
  >
    {dot && <span className={styles.dot} aria-hidden="true" />}
    {children}
  </span>
);
