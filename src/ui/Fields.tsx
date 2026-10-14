import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import styles from "./controls.module.css";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  inline?: boolean;
}

function FieldShell({ label, hint, children, inline }: FieldShellProps) {
  const id = useId();
  return (
    <div className={inline ? styles.fieldInline : styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {children(id)}
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  multiline?: boolean;
}

/** Text input that commits on Enter or blur, so each edit is one undo step. Escape reverts. */
export function TextField({
  label,
  value,
  onCommit,
  placeholder,
  hint,
  disabled,
  multiline,
}: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    // The value changed outside the field (undo, another control): show it.
    setSynced(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (!multiline || event.ctrlKey)) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    } else if (event.key === "Escape") {
      setDraft(value);
      requestAnimationFrame(() => (event.target as HTMLElement).blur());
    }
  };

  return (
    <FieldShell label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            className={`${styles.input} ${styles.textarea}`}
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
        ) : (
          <input
            id={id}
            className={styles.input}
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
        )
      }
    </FieldShell>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  /** Called continuously while scrubbing the label; falls back to onCommit. */
  onScrub?: (value: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  disabled?: boolean;
  inline?: boolean;
  hint?: ReactNode;
}

function clampValue(value: number, min?: number, max?: number) {
  let v = value;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/**
 * Numeric input with unit suffix. Arrow keys step (Shift × 10), and dragging the
 * label horizontally scrubs the value, as in most creative tools.
 */
export function NumberField({
  label,
  value,
  onCommit,
  onScrub,
  onScrubStart,
  onScrubEnd,
  unit,
  min,
  max,
  step = 1,
  precision = 0,
  disabled,
  inline,
  hint,
}: NumberFieldProps) {
  const format = (v: number) => (Number.isFinite(v) ? v.toFixed(precision) : "");
  const [draft, setDraft] = useState(format(value));
  const [invalid, setInvalid] = useState(false);
  const scrub = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(format(value));
  }

  const commitDraft = () => {
    const parsed = Number(draft.replace(",", "."));
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setInvalid(true);
      setDraft(format(value));
      setTimeout(() => setInvalid(false), 900);
      return;
    }
    const next = clampValue(parsed, min, max);
    setDraft(format(next));
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(format(value));
      requestAnimationFrame(() => (event.target as HTMLElement).blur());
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = (event.key === "ArrowUp" ? step : -step) * (event.shiftKey ? 10 : 1);
      const next = clampValue(Number((value + delta).toFixed(precision + 2)), min, max);
      if (next !== value) onCommit(next);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLLabelElement>) => {
    if (disabled || event.button !== 0) return;
    scrub.current = { x: event.clientX, start: value, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLLabelElement>) => {
    const s = scrub.current;
    if (!s) return;
    const dx = event.clientX - s.x;
    if (!s.moved && Math.abs(dx) < 3) return;
    if (!s.moved) {
      s.moved = true;
      onScrubStart?.();
    }
    const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const next = clampValue(
      Number((s.start + Math.round(dx / 2) * step * factor).toFixed(precision + 2)),
      min,
      max,
    );
    (onScrub ?? onCommit)(next);
  };
  const onPointerUp = () => {
    if (scrub.current?.moved) onScrubEnd?.();
    scrub.current = null;
  };

  const id = useId();
  return (
    <div className={inline ? styles.fieldInline : styles.field}>
      <label
        htmlFor={id}
        className={`${styles.fieldLabel} ${disabled ? "" : styles.scrubbable}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {label}
      </label>
      <div className={`${styles.numberWrap} ${invalid ? styles.invalid : ""}`}>
        <input
          id={id}
          className={`${styles.input} num`}
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={onKeyDown}
          onFocus={(e) => e.currentTarget.select()}
        />
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  inline?: boolean;
  hint?: ReactNode;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  inline,
  hint,
}: SelectFieldProps<T>) {
  return (
    <FieldShell label={label} inline={inline} hint={hint}>
      {(id) => (
        <div className={styles.selectWrap}>
          <select
            id={id}
            className={styles.input}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as T)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </FieldShell>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  disabled?: boolean;
}

/** Range slider. onStart/onEnd bracket a drag so it becomes a single undo step. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onInput,
  onStart,
  onEnd,
  disabled,
}: SliderFieldProps) {
  const id = useId();
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.field}>
      <div className={styles.sliderHead}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        <output htmlFor={id} className={`${styles.sliderValue} num`}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className={styles.slider}
        style={{ "--progress": `${progress}%` } as CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onKeyDown={onStart}
        onKeyUp={onEnd}
        onChange={(e) => onInput(Number(e.target.value))}
      />
    </div>
  );
}

/** A read-only value laid out like a field, for derived numbers next to inputs. */
export function Readout({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.readout} num`}>{value}</span>
    </div>
  );
}
