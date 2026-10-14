import { useEffect, useState, type ComponentType } from "react";
import { platform } from "../platform";
import { selectIsDirty, useAppStore, type WorkspaceId } from "../state/store";
import { BusyIndicator, ConfirmDialog, Toasts } from "../ui/Overlays";
import { BoardsWorkspace } from "../workspaces/boards/BoardsWorkspace";
import { ComposeWorkspace } from "../workspaces/compose/ComposeWorkspace";
import { DrawingsWorkspace } from "../workspaces/drawings/DrawingsWorkspace";
import styles from "./App.module.css";
import {
  handleDroppedFiles,
  newProject,
  openProject,
  pickIntoWorkspace,
  saveProject,
} from "./commands";
import { ErrorBoundary } from "./ErrorBoundary";
import { useShortcuts } from "./shortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { TitleBlock } from "./TitleBlock";
import { TopBar } from "./TopBar";

const WORKSPACES: Record<WorkspaceId, ComponentType> = {
  compose: ComposeWorkspace,
  drawings: DrawingsWorkspace,
  boards: BoardsWorkspace,
};

function useGlobalShortcuts(openShortcuts: () => void) {
  const store = useAppStore.getState;
  useShortcuts({
    "Mod+N": () => void newProject(),
    "Mod+O": () => void openProject(),
    "Mod+S": () => void saveProject(false),
    "Mod+Shift+S": () => void saveProject(true),
    "Mod+I": () => void pickIntoWorkspace(),
    "Mod+Z": () => store().undo(),
    "Mod+Shift+Z": () => store().redo(),
    "Mod+Y": () => store().redo(),
    "Mod+1": () => store().setWorkspace("compose"),
    "Mod+2": () => store().setWorkspace("drawings"),
    "Mod+3": () => store().setWorkspace("boards"),
    "Mod+B": () => store().togglePanel("left"),
    "Mod+Alt+B": () => store().togglePanel("right"),
    "?": openShortcuts,
    F1: openShortcuts,
  });
}

/** Asks before the window closes with unsaved changes. */
function useCloseGuard() {
  useEffect(() => {
    if (platform.kind === "browser") {
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        if (selectIsDirty(useAppStore.getState())) event.preventDefault();
      };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      void win
        .onCloseRequested(async (event) => {
          if (!selectIsDirty(useAppStore.getState())) return;
          event.preventDefault();
          const discard = await useAppStore.getState().requestConfirm({
            title: "Close with unsaved changes?",
            message: "The project has changes that are not saved. Closing will discard them.",
            confirmLabel: "Close without saving",
          });
          if (discard) await win.destroy();
        })
        .then((fn) => (disposed ? fn() : (unlisten = fn)));
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

export function App() {
  const workspace = useAppStore((s) => s.workspace);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useGlobalShortcuts(() => setShortcutsOpen(true));
  useCloseGuard();
  useEffect(() => platform.onFileDrop((files) => void handleDroppedFiles(files)), []);

  const Workspace = WORKSPACES[workspace];
  return (
    <div className={styles.app}>
      <TopBar onShowShortcuts={() => setShortcutsOpen(true)} />
      <main
        className={styles.main}
        id={`workspace-${workspace}`}
        aria-label={`${workspace[0]!.toUpperCase()}${workspace.slice(1)} workspace`}
      >
        <ErrorBoundary key={workspace} area={workspace}>
          <Workspace />
        </ErrorBoundary>
      </main>
      <TitleBlock />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConfirmDialog />
      <Toasts />
      <BusyIndicator />
    </div>
  );
}
