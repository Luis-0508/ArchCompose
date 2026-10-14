import { useEffect, useRef } from "react";
import { useAppStore } from "../state/store";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import styles from "./overlays.module.css";

/** The single confirmation dialog, driven by `requestConfirm` in the store. */
export function ConfirmDialog() {
  const request = useAppStore((s) => s.confirm);
  const resolve = useAppStore((s) => s.resolveConfirm);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (request && !node.open) node.showModal();
    if (!request && node.open) node.close();
  }, [request]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={(e) => {
        e.preventDefault();
        resolve(false);
      }}
    >
      {request ? (
        <>
          <h2 id="confirm-title" className={styles.dialogTitle}>
            {request.title}
          </h2>
          <p id="confirm-message" className={styles.dialogMessage}>
            {request.message}
          </p>
          <div className={styles.dialogActions}>
            <Button onClick={() => resolve(false)} autoFocus>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => resolve(true)}>
              {request.confirmLabel}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

export function Toasts() {
  const notices = useAppStore((s) => s.notices);
  const dismiss = useAppStore((s) => s.dismissNotice);
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`${styles.toast} ${styles[notice.tone]}`}>
          <Icon
            name={notice.tone === "error" ? "error" : notice.tone === "success" ? "check" : "info"}
            size={16}
            className={styles.toastIcon}
          />
          <p className={styles.toastMessage}>{notice.message}</p>
          <IconButton
            icon="close"
            label="Dismiss"
            size="sm"
            onClick={() => dismiss(notice.id)}
            tooltipPlacement="left"
          />
        </div>
      ))}
    </div>
  );
}

export function BusyIndicator() {
  const busy = useAppStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className={styles.busy} role="status" aria-live="polite">
      <span className={styles.busyBar} aria-hidden />
      {busy}
    </div>
  );
}
