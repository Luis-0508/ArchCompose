import type { ReactNode } from "react";
import { useAppStore } from "../state/store";
import styles from "./workspace.module.css";

interface WorkspaceLayoutProps {
  rail?: ReactNode;
  left: ReactNode;
  leftLabel: string;
  center: ReactNode;
  /** Optional strip above the viewport for contextual controls. */
  context?: ReactNode;
  right: ReactNode;
  rightLabel: string;
}

/**
 * The docked layout shared by all workspaces: optional tool rail, a navigation
 * panel, the document area and the inspector. Panels can be hidden per session.
 */
export function WorkspaceLayout({
  rail,
  left,
  leftLabel,
  center,
  context,
  right,
  rightLabel,
}: WorkspaceLayoutProps) {
  const panels = useAppStore((s) => s.panels);
  const columns = [
    rail ? "var(--w-rail)" : null,
    panels.left ? "var(--w-left)" : null,
    "minmax(0, 1fr)",
    panels.right ? "var(--w-right)" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.layout} style={{ gridTemplateColumns: columns }}>
      {rail ? <div className={styles.rail}>{rail}</div> : null}
      {panels.left ? (
        <aside className={styles.left} aria-label={leftLabel}>
          {left}
        </aside>
      ) : null}
      <div className={styles.center}>
        {context ? <div className={styles.context}>{context}</div> : null}
        <div className={styles.document}>{center}</div>
      </div>
      {panels.right ? (
        <aside className={styles.right} aria-label={rightLabel}>
          {right}
        </aside>
      ) : null}
    </div>
  );
}
