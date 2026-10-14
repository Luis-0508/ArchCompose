import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Icon, type IconName } from "./Icon";
import { Tooltip } from "./Tooltip";
import styles from "./controls.module.css";

type Variant = "primary" | "default" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: IconName;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={16} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  shortcut?: string;
  note?: ReactNode;
  pressed?: boolean;
  size?: "sm" | "md";
  tooltipPlacement?: "top" | "bottom" | "right" | "left";
  ref?: Ref<HTMLButtonElement>;
}

/** Icon-only button. The label is both its accessible name and its tooltip. */
export function IconButton({
  icon,
  label,
  shortcut,
  note,
  pressed,
  size = "md",
  tooltipPlacement = "bottom",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut} note={note} placement={tooltipPlacement}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={[styles.iconButton, styles[`icon_${size}`], className].filter(Boolean).join(" ")}
        {...rest}
      >
        <Icon name={icon} size={size === "sm" ? 16 : 18} />
      </button>
    </Tooltip>
  );
}
