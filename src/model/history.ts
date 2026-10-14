/**
 * Snapshot-based undo history. Snapshots are cheap because every model update
 * returns a new object and shares unchanged branches with the previous state.
 */
export interface HistoryEntry<T> {
  state: T;
  /** Human-readable name of the change that left this state, e.g. "Move layer". */
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
}

export const HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records a change. Identical states are ignored so no-op edits do not pollute undo. */
export function commit<T>(history: History<T>, next: T, label: string): History<T> {
  if (next === history.present) return history;
  return commitFrom({ ...history, present: next }, history.present, label);
}

/**
 * Records a change whose intermediate steps were applied with `replacePresent`,
 * such as a drag. `base` is the state before the gesture started.
 */
export function commitFrom<T>(history: History<T>, base: T, label: string): History<T> {
  if (base === history.present) return history;
  const past = [...history.past, { state: base, label }];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: history.present,
    future: [],
  };
}

/** Updates the present state without creating an undo step. */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  return next === history.present ? history : { ...history, present: next };
}

export function undo<T>(history: History<T>): History<T> {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return {
    past: history.past.slice(0, -1),
    present: entry.state,
    future: [{ state: history.present, label: entry.label }, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [entry, ...rest] = history.future;
  if (!entry) return history;
  return {
    past: [...history.past, { state: history.present, label: entry.label }],
    present: entry.state,
    future: rest,
  };
}
