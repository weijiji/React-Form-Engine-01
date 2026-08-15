import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Input.module.css";

export type InputSize = "default" | "sm" | "lg";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
  /** Leading icon. When set, the input renders inside an icon-mode wrapper
      (the old `.input-wrap`) and `className` lands on that wrapper. */
  icon?: ReactNode;
  /** Applied to the outermost element — the wrapper div in icon mode,
      the `<input>` itself otherwise. */
  className?: string;
  /** Applied to the inner `<input>`. */
  inputClassName?: string;
}

const SIZE_CLASS: Record<InputSize, string> = {
  default: "",
  sm: styles.sm,
  lg: styles.lg,
};

export const Input: React.FC<InputProps> = ({
  size = "default",
  icon,
  className,
  inputClassName,
  ...rest
}) => {
  const inputClass = [styles.input, SIZE_CLASS[size], inputClassName]
    .filter(Boolean)
    .join(" ");
  if (!icon)
    return <input className={[inputClass, className].filter(Boolean).join(" ")} {...rest} />;
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <span className={styles.icon}>{icon}</span>
      <input className={inputClass} {...rest} />
    </div>
  );
};
