import { useId, useState, type ReactNode } from "react";
import { capability, type CapabilityId } from "../engine/capabilities";
import { Icon, type IconName } from "./Icon";
import styles from "./panel.module.css";

interface SectionProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  flush?: boolean;
}

/** A titled group inside a docked panel. */
export function Section({
  title,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  flush = false,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHead}>
        {collapsible ? (
          <button
            type="button"
            className={styles.sectionToggle}
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? "down" : "right"} size={14} />
            <h3 id={`${id}-title`} className={styles.sectionTitle}>
              {title}
            </h3>
          </button>
        ) : (
          <h3 id={`${id}-title`} className={styles.sectionTitle}>
            {title}
          </h3>
        )}
        {actions ? <div className={styles.sectionActions}>{actions}</div> : null}
      </header>
      {open ? (
        <div id={`${id}-body`} className={flush ? styles.sectionBodyFlush : styles.sectionBody}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, children, actions, compact }: EmptyStateProps) {
  return (
    <div className={compact ? styles.emptyCompact : styles.empty}>
      {icon ? <Icon name={icon} size={compact ? 18 : 22} className={styles.emptyIcon} /> : null}
      <p className={styles.emptyTitle}>{title}</p>
      {children ? <div className={styles.emptyBody}>{children}</div> : null}
      {actions ? <div className={styles.emptyActions}>{actions}</div> : null}
    </div>
  );
}

/**
 * Lists planned capabilities as a compact, clearly unavailable block. Used in
 * inspectors so users can see what is coming without mistaking it for a control.
 */
export function PlannedList({ ids, title = "Planned" }: { ids: CapabilityId[]; title?: string }) {
  return (
    <div
      className={styles.planned}
      aria-label={`${title} features, not available yet`}
      role="group"
    >
      <p className={styles.plannedTitle}>{title}</p>
      <ul className={styles.plannedList}>
        {ids.map((id) => {
          const cap = capability(id);
          return (
            <li key={id} className={styles.plannedItem}>
              <span className={styles.plannedLabel}>{cap.label}</span>
              <span className={styles.plannedNote}>{cap.note}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Key/value rows for read-only document facts. */
export function FactList({ facts }: { facts: readonly [string, ReactNode][] }) {
  return (
    <dl className={styles.facts}>
      {facts.map(([key, value]) => (
        <div key={key} className={styles.fact}>
          <dt>{key}</dt>
          <dd className="num">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
