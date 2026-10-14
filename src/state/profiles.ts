import { create } from "zustand";

/**
 * Local user profiles. Cosmetic only: a profile is a name shown in the top bar. Profiles
 * are stored in the web view's local storage and are not part of any project file.
 */
export interface Profile {
  id: string;
  name: string;
}

export interface ProfilesState {
  profiles: Profile[];
  activeId: string | null;
}

export const EMPTY_PROFILES: ProfilesState = { profiles: [], activeId: null };
export const MAX_NAME_LENGTH = 40;
const STORAGE_KEY = "archcompose.profiles";

/** Trims and collapses whitespace. Returns null for a name that cannot be used. */
export function normalizeName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > MAX_NAME_LENGTH) return null;
  return clean;
}

/** Profiles named Finja get a red heart and a frame of hearts. */
export function hasHeartFlair(name: string): boolean {
  return name.trim().toLocaleLowerCase("en") === "finja";
}

/** Up to two initials for the avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts.at(-1)!] : parts.slice(0, 1);
  return letters.map((part) => [...part][0]!.toLocaleUpperCase()).join("");
}

/** Adds a profile and makes it active. */
export function addProfile(state: ProfilesState, profile: Profile): ProfilesState {
  return { profiles: [...state.profiles, profile], activeId: profile.id };
}

export function selectProfile(state: ProfilesState, id: string): ProfilesState {
  return state.profiles.some((p) => p.id === id) ? { ...state, activeId: id } : state;
}

/** Removes a profile. When it was active, the first remaining one becomes active. */
export function removeProfile(state: ProfilesState, id: string): ProfilesState {
  const profiles = state.profiles.filter((p) => p.id !== id);
  const activeId = state.activeId === id ? (profiles[0]?.id ?? null) : state.activeId;
  return { profiles, activeId };
}

/** Reads stored profiles, ignoring anything malformed. */
export function parseProfiles(text: string | null): ProfilesState {
  if (!text) return EMPTY_PROFILES;
  try {
    const data = JSON.parse(text) as Partial<ProfilesState>;
    const profiles = Array.isArray(data.profiles)
      ? data.profiles.filter(
          (p): p is Profile =>
            typeof p === "object" &&
            p !== null &&
            typeof p.id === "string" &&
            typeof p.name === "string",
        )
      : [];
    const activeId = profiles.some((p) => p.id === data.activeId) ? data.activeId! : null;
    return { profiles, activeId };
  } catch {
    return EMPTY_PROFILES;
  }
}

function load(): ProfilesState {
  try {
    return parseProfiles(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return EMPTY_PROFILES;
  }
}

function persist(state: ProfilesState): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

interface ProfilesStore extends ProfilesState {
  /** Returns an error sentence when the profile could not be created or saved. */
  create(name: string): string | null;
  select(id: string): void;
  remove(id: string): void;
}

export const useProfiles = create<ProfilesStore>()((set, get) => {
  const update = (next: ProfilesState) => {
    set(next);
    return persist(next);
  };
  return {
    ...load(),
    create(name) {
      const clean = normalizeName(name);
      if (!clean) return `Enter a name with 1 to ${MAX_NAME_LENGTH} characters.`;
      const saved = update(addProfile(get(), { id: crypto.randomUUID(), name: clean }));
      return saved
        ? null
        : "The profile was created but could not be stored, so it will be gone after a restart.";
    },
    select(id) {
      update(selectProfile(get(), id));
    },
    remove(id) {
      update(removeProfile(get(), id));
    },
  };
});

export const selectActiveProfile = (s: ProfilesState): Profile | null =>
  s.profiles.find((p) => p.id === s.activeId) ?? null;
