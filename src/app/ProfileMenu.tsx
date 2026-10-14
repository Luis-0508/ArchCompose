import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  MAX_NAME_LENGTH,
  hasHeartFlair,
  initials,
  normalizeName,
  selectActiveProfile,
  useProfiles,
} from "../state/profiles";
import { useAppStore } from "../state/store";
import { Button, IconButton } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";
import controls from "../ui/controls.module.css";
import styles from "./ProfileMenu.module.css";

const HEART = "M10 17S3 12.6 3 7.8a3.8 3.8 0 0 1 7-2.2 3.8 3.8 0 0 1 7 2.2C17 12.6 10 17 10 17Z";
const FRAME_HEARTS = 10;

/** A ring of small hearts around the avatar. */
function HeartFrame({ size }: { size: number }) {
  const box = size + 14;
  const radius = size / 2 + 3.5;
  const heart = 6;
  return (
    <svg
      className={styles.frame}
      width={box}
      height={box}
      viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
      aria-hidden
      data-testid="heart-frame"
    >
      {Array.from({ length: FRAME_HEARTS }, (_, i) => {
        const angle = (i / FRAME_HEARTS) * Math.PI * 2;
        const x = Math.sin(angle) * radius;
        const y = -Math.cos(angle) * radius;
        return (
          <path
            key={i}
            d={HEART}
            transform={`translate(${x} ${y}) scale(${heart / 20}) translate(-10 -10)`}
          />
        );
      })}
    </svg>
  );
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const flair = hasHeartFlair(name);
  return (
    <span
      className={`${styles.avatar} ${flair ? styles.flair : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {flair ? <HeartFrame size={size} /> : null}
      <span className={styles.initials}>{initials(name)}</span>
      {flair ? (
        <svg className={styles.heart} viewBox="0 0 20 20" data-testid="heart-badge">
          <path d={HEART} />
        </svg>
      ) : null}
    </span>
  );
}

function ProfilesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameId = useId();
  const { profiles, activeId, create, select, remove } = useProfiles();
  const notify = useAppStore((s) => s.notify);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizeName(name)) {
      setError(`Enter a name with 1 to ${MAX_NAME_LENGTH} characters.`);
      return;
    }
    const problem = create(name);
    if (problem) notify("error", problem);
    setName("");
    setError(null);
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="profiles-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className={styles.head}>
        <h2 id="profiles-title">Profiles</h2>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div className={styles.body}>
        {profiles.length ? (
          <ul className={styles.list} aria-label="Profiles on this computer">
            {profiles.map((profile) => (
              <li key={profile.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.pick}
                  aria-current={profile.id === activeId || undefined}
                  onClick={() => select(profile.id)}
                >
                  <Avatar name={profile.name} size={28} />
                  <span className={styles.name}>{profile.name}</span>
                  {profile.id === activeId ? <span className={styles.badge}>Active</span> : null}
                </button>
                <IconButton
                  icon="trash"
                  size="sm"
                  label={`Remove profile ${profile.name}`}
                  tooltipPlacement="left"
                  onClick={() => remove(profile.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.note}>No profiles yet. Create one to show your name here.</p>
        )}
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={controls.field}>
            <label htmlFor={nameId} className={controls.fieldLabel}>
              Name
            </label>
            <input
              id={nameId}
              className={controls.input}
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${nameId}-error` : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <Button type="submit" variant="primary" icon="plus">
            Create profile
          </Button>
        </form>
        {error ? (
          <p id={`${nameId}-error`} className={styles.error}>
            {error}
          </p>
        ) : null}
        <p className={styles.note}>
          Profiles are stored on this computer only. They change how the app greets you, not your
          projects.
        </p>
      </div>
    </dialog>
  );
}

export function ProfileMenu() {
  const active = useProfiles(selectActiveProfile);
  const [open, setOpen] = useState(false);

  return (
    <>
      {active ? (
        <Tooltip label={`Profile: ${active.name}`} note="Manage profiles">
          <button
            type="button"
            className={styles.trigger}
            aria-label={`Profile: ${active.name}`}
            onClick={() => setOpen(true)}
          >
            <Avatar name={active.name} />
          </button>
        </Tooltip>
      ) : (
        <IconButton icon="user" label="Create profile" onClick={() => setOpen(true)} />
      )}
      <ProfilesDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
