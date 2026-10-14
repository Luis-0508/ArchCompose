import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
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
const HEART_SPACING = 9;
const HEART_SIZE = 6;

/** Evenly spaced points on a stadium (a pill; a circle when square), centred on 0,0. */
function stadiumPoints(width: number, height: number): [number, number][] {
  const r = Math.min(width, height) / 2;
  const straight = Math.max(width, height) - 2 * r;
  const perimeter = 2 * straight + 2 * Math.PI * r;
  const count = Math.max(8, Math.round(perimeter / HEART_SPACING));
  const arc = Math.PI * r;
  return Array.from({ length: count }, (_, i) => {
    let d = (i / count) * perimeter;
    if (d < straight) return [-straight / 2 + d, -r];
    d -= straight;
    if (d < arc) {
      const a = -Math.PI / 2 + d / r;
      return [straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
    }
    d -= arc;
    if (d < straight) return [straight / 2 - d, r];
    d -= straight;
    const a = Math.PI / 2 + d / r;
    return [-straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
  });
}

/** A frame of small hearts around a round or pill-shaped element of the given size. */
function HeartFrame({
  width,
  height,
  testId = "heart-frame",
}: {
  width: number;
  height: number;
  testId?: string;
}) {
  const w = width + 7;
  const h = height + 7;
  const boxW = w + HEART_SIZE + 2;
  const boxH = h + HEART_SIZE + 2;
  return (
    <svg
      className={styles.frame}
      width={boxW}
      height={boxH}
      viewBox={`${-boxW / 2} ${-boxH / 2} ${boxW} ${boxH}`}
      aria-hidden
      data-testid={testId}
    >
      {stadiumPoints(w, h).map(([x, y], i) => (
        <path
          key={i}
          d={HEART}
          transform={`translate(${x} ${y}) scale(${HEART_SIZE / 20}) translate(-10 -10)`}
        />
      ))}
    </svg>
  );
}

/** Follows an element's border-box size. */
function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setSize({ width: node.offsetWidth, height: node.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The avatar. `framed` draws the heart frame around the avatar itself. */
export function Avatar({
  name,
  size = 24,
  framed = true,
}: {
  name: string;
  size?: number;
  framed?: boolean;
}) {
  const flair = hasHeartFlair(name);
  return (
    <span
      className={`${styles.avatar} ${flair ? styles.flair : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {flair && framed ? <HeartFrame width={size} height={size} /> : null}
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

/** The active profile in the top bar: avatar and name in one pill. */
function ProfileChip({ name, onClick }: { name: string; onClick: () => void }) {
  // Tooltip owns the button's ref, so the wrapper is measured instead.
  const ref = useRef<HTMLSpanElement>(null);
  const size = useSize(ref);
  const flair = hasHeartFlair(name);
  return (
    <span ref={ref} className={styles.chipWrap}>
      {flair && size ? (
        <HeartFrame width={size.width} height={size.height} testId="chip-heart-frame" />
      ) : null}
      <Tooltip label="Manage profiles">
        <button
          type="button"
          className={`${styles.chip} ${flair ? styles.chipFlair : ""}`}
          aria-label={`Profile: ${name}`}
          onClick={onClick}
        >
          <Avatar name={name} size={22} framed={false} />
          <span className={styles.chipName}>{name}</span>
        </button>
      </Tooltip>
    </span>
  );
}

export function ProfileMenu() {
  const active = useProfiles(selectActiveProfile);
  const [open, setOpen] = useState(false);

  return (
    <>
      {active ? (
        <ProfileChip name={active.name} onClick={() => setOpen(true)} />
      ) : (
        <IconButton icon="user" label="Create profile" onClick={() => setOpen(true)} />
      )}
      <ProfilesDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
