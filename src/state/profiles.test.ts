import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILES,
  addProfile,
  hasHeartFlair,
  initials,
  normalizeName,
  parseProfiles,
  removeProfile,
  selectProfile,
} from "./profiles";

const ada = { id: "a", name: "Ada Lovelace" };
const finja = { id: "f", name: "Finja" };

describe("profiles", () => {
  it("normalizes names and rejects empty or long ones", () => {
    expect(normalizeName("  Ada   Lovelace ")).toBe("Ada Lovelace");
    expect(normalizeName("   ")).toBeNull();
    expect(normalizeName("x".repeat(41))).toBeNull();
  });

  it("gives the heart flair to Finja only, ignoring case and spaces", () => {
    expect(hasHeartFlair("Finja")).toBe(true);
    expect(hasHeartFlair(" fINJA ")).toBe(true);
    expect(hasHeartFlair("Finja K")).toBe(false);
    expect(hasHeartFlair("Ada")).toBe(false);
  });

  it("derives initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("finja")).toBe("F");
    expect(initials("Jean Claude Van Damme")).toBe("JD");
  });

  it("adds, selects and removes profiles", () => {
    let state = addProfile(EMPTY_PROFILES, ada);
    state = addProfile(state, finja);
    expect(state.activeId).toBe("f");
    state = selectProfile(state, "a");
    expect(state.activeId).toBe("a");
    expect(selectProfile(state, "missing")).toBe(state);
    state = removeProfile(state, "a");
    expect(state).toEqual({ profiles: [finja], activeId: "f" });
    state = removeProfile(state, "f");
    expect(state).toEqual(EMPTY_PROFILES);
  });

  it("parses stored profiles and ignores malformed data", () => {
    const text = JSON.stringify({ profiles: [ada, { id: 3 }], activeId: "a" });
    expect(parseProfiles(text)).toEqual({ profiles: [ada], activeId: "a" });
    expect(parseProfiles(JSON.stringify({ profiles: [ada], activeId: "x" })).activeId).toBeNull();
    expect(parseProfiles("{not json")).toEqual(EMPTY_PROFILES);
    expect(parseProfiles(null)).toEqual(EMPTY_PROFILES);
  });
});
