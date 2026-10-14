import { useEffect, useRef } from "react";
import { IconButton } from "../ui/Button";
import styles from "./App.module.css";
import { SHORTCUT_REFERENCE, shortcutLabel } from "./shortcuts";

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.shortcuts}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className={styles.shortcutsHead}>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div className={styles.shortcutsGrid}>
        {SHORTCUT_REFERENCE.map((group) => (
          <section key={group.group}>
            <h3>{group.group}</h3>
            <dl>
              {group.items.map(([combo, action]) => (
                <div key={combo}>
                  <dt>{action}</dt>
                  <dd>
                    <kbd>{shortcutLabel(combo)}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
