import { beforeEach, describe, expect, it } from "vitest";
import { renameProject } from "../model/project";
import { initialState, selectIsDirty, useAppStore } from "./store";

const store = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState());
});

describe("app store", () => {
  it("tracks unsaved changes against the saved project", () => {
    expect(selectIsDirty(store())).toBe(false);
    store().apply("Rename project", (p) => renameProject(p, "Housing"));
    expect(selectIsDirty(store())).toBe(true);
    store().markSaved("C:/projects/housing.archcompose");
    expect(selectIsDirty(store())).toBe(false);
    expect(store().filePath).toBe("C:/projects/housing.archcompose");
    store().undo();
    expect(selectIsDirty(store())).toBe(true);
  });

  it("folds a gesture into one undo step and blocks undo while dragging", () => {
    store().beginGesture();
    store().applyTransient((p) => renameProject(p, "A"));
    store().applyTransient((p) => renameProject(p, "AB"));
    store().undo(); // ignored mid-gesture
    expect(store().history.present.name).toBe("AB");
    store().endGesture("Rename");
    expect(store().history.past).toHaveLength(1);
    store().undo();
    expect(store().history.present.name).toBe("Untitled project");
  });

  it("keeps fit mode until the user zooms", () => {
    store().syncView("v", { width: 1000, height: 600 }, { width: 2000, height: 1000 });
    const fitted = store().views.v!;
    expect(fitted.fit).toBe(true);
    store().zoomStep("v", 1);
    expect(store().views.v!.fit).toBe(false);
    expect(store().views.v!.camera.zoom).toBeGreaterThan(fitted.camera.zoom);
    store().syncView("v", { width: 1200, height: 700 }, { width: 2000, height: 1000 });
    expect(store().views.v!.fit).toBe(false);
    store().fitView("v");
    expect(store().views.v!.fit).toBe(true);
  });

  it("resolves a pending confirmation", async () => {
    const answer = store().requestConfirm({ title: "t", message: "m", confirmLabel: "OK" });
    expect(store().confirm).not.toBeNull();
    store().resolveConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(store().confirm).toBeNull();
  });
});
