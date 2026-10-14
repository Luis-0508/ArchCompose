import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Tooltip } from "./Tooltip";
import styles from "./controls.module.css";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  shortcut?: string;
  /** Planned options are shown but cannot be chosen; the note explains why. */
  disabled?: boolean;
  note?: ReactNode;
}

/** Moves focus between enabled items of a group with arrow keys, Home and End. */
function useRovingFocus(orientation: "horizontal" | "vertical") {
  const container = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    if (![next, prev, "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      container.current?.querySelectorAll<HTMLElement>(
        "[data-roving]:not([aria-disabled='true'])",
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (items.length === 0) return;
    event.preventDefault();
    let target = index;
    if (event.key === next) target = (index + 1) % items.length;
    if (event.key === prev) target = (index - 1 + items.length) % items.length;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = items.length - 1;
    items[target]?.focus();
    items[target]?.click();
  };
  return { container, onKeyDown };
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

/** Single-choice segmented control (ARIA radiogroup). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const { container, onKeyDown } = useRovingFocus("horizontal");
  return (
    <div
      ref={container}
      role="radiogroup"
      aria-label={label}
      className={[styles.segmented, styles[`seg_${size}`], className].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const button = (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-roving
            aria-checked={selected}
            aria-disabled={option.disabled || undefined}
            tabIndex={selected ? 0 : -1}
            className={styles.segment}
            onClick={() => !option.disabled && onChange(option.value)}
          >
            {option.icon ? <Icon name={option.icon} size={16} /> : null}
            <span>{option.label}</span>
          </button>
        );
        return option.shortcut || option.note ? (
          <Tooltip
            key={option.value}
            label={option.label}
            shortcut={option.shortcut}
            note={option.note}
          >
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}

interface ToolRailProps<T extends string> {
  label: string;
  value: T;
  tools: readonly ChoiceOption<T>[];
  planned?: readonly ChoiceOption<string>[];
  onChange: (value: T) => void;
}

/**
 * Vertical tool palette. Working tools form a radio group; planned tools sit
 * below a rule, visibly unavailable, with a tooltip explaining what they need.
 */
export function ToolRail<T extends string>({
  label,
  value,
  tools,
  planned = [],
  onChange,
}: ToolRailProps<T>) {
  const { container, onKeyDown } = useRovingFocus("vertical");
  return (
    <div className={styles.toolRail}>
      <div
        ref={container}
        role="radiogroup"
        aria-label={label}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className={styles.toolGroup}
      >
        {tools.map((tool) => (
          <Tooltip
            key={tool.value}
            label={tool.label}
            shortcut={tool.shortcut}
            note={tool.note}
            placement="right"
          >
            <button
              type="button"
              role="radio"
              data-roving
              aria-checked={tool.value === value}
              aria-label={tool.label}
              tabIndex={tool.value === value ? 0 : -1}
              className={styles.tool}
              onClick={() => onChange(tool.value)}
            >
              <Icon name={tool.icon ?? "select"} />
            </button>
          </Tooltip>
        ))}
      </div>
      {planned.length > 0 ? (
        <div className={styles.toolGroup} role="group" aria-label="Planned tools">
          <span className={styles.railRule} aria-hidden />
          {planned.map((tool) => (
            <Tooltip
              key={tool.value}
              label={`${tool.label} (planned)`}
              note={tool.note}
              placement="right"
            >
              <button
                type="button"
                aria-disabled="true"
                aria-label={`${tool.label}, planned`}
                className={`${styles.tool} ${styles.toolPlanned}`}
              >
                <Icon name={tool.icon ?? "select"} />
              </button>
            </Tooltip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface TabsProps<T extends string> {
  label: string;
  value: T;
  tabs: readonly { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  idPrefix: string;
}

/** Panel tabs (ARIA tablist). Panels use `${idPrefix}-panel-${value}` as id. */
export function Tabs<T extends string>({ label, value, tabs, onChange, idPrefix }: TabsProps<T>) {
  const { container, onKeyDown } = useRovingFocus("horizontal");
  return (
    <div
      ref={container}
      role="tablist"
      aria-label={label}
      className={styles.tabs}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          data-roving
          id={`${idPrefix}-tab-${tab.value}`}
          aria-controls={`${idPrefix}-panel-${tab.value}`}
          aria-selected={tab.value === value}
          tabIndex={tab.value === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className={`${styles.tabCount} num`}>{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
