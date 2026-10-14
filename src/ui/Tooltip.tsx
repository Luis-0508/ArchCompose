import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

type Placement = "top" | "bottom" | "right" | "left";

interface TooltipProps {
  label: ReactNode;
  shortcut?: string;
  /** Secondary line, e.g. why a control is unavailable. */
  note?: ReactNode;
  placement?: Placement;
  children: ReactElement<Record<string, unknown>>;
}

const DELAY_MS = 380;

/**
 * Hover and focus tooltip rendered in a portal so docked panels cannot clip it.
 * The trigger is described by the tooltip for assistive technology.
 */
export function Tooltip({ label, shortcut, note, placement = "bottom", children }: TooltipProps) {
  const id = useId();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setRect(null);
  }, []);

  const show = useCallback(
    (immediate: boolean) => {
      window.clearTimeout(timer.current);
      const open = () => {
        if (trigger?.isConnected) setRect(trigger.getBoundingClientRect());
      };
      if (immediate) open();
      else timer.current = window.setTimeout(open, DELAY_MS);
    },
    [trigger],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!rect) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", hide, true);
    };
  }, [rect, hide]);

  // The handlers only touch the timer ref when events fire, never during render;
  // the compiler cannot see through cloneElement, hence the suppression.
  // eslint-disable-next-line react-hooks/refs
  const child = cloneElement(children, {
    ref: setTrigger,
    "aria-describedby": rect ? id : undefined,
    onPointerEnter: () => show(false),
    onPointerLeave: hide,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(":focus-visible")) show(true);
    },
    onBlur: hide,
  });

  let style: CSSProperties | undefined;
  if (rect) {
    const gap = 8;
    switch (placement) {
      case "top":
        style = { left: rect.left + rect.width / 2, top: rect.top - gap, translate: "-50% -100%" };
        break;
      case "right":
        style = { left: rect.right + gap, top: rect.top + rect.height / 2, translate: "0 -50%" };
        break;
      case "left":
        style = { left: rect.left - gap, top: rect.top + rect.height / 2, translate: "-100% -50%" };
        break;
      default:
        style = { left: rect.left + rect.width / 2, top: rect.bottom + gap, translate: "-50% 0" };
    }
  }

  return (
    <>
      {child}
      {rect
        ? createPortal(
            <div role="tooltip" id={id} className={styles.tooltip} style={style}>
              <span className={styles.label}>
                {label}
                {shortcut ? <kbd className={styles.kbd}>{shortcut}</kbd> : null}
              </span>
              {note ? <span className={styles.note}>{note}</span> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
