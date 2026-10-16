import { useAppStore, type WorkspaceId } from "../state/store";
import { IconButton } from "../ui/Button";
import { Segmented, type ChoiceOption } from "../ui/Choice";
import styles from "./App.module.css";
import { newProject, openProject, saveProject } from "./commands";
import { ProfileMenu } from "./ProfileMenu";
import { shortcutLabel } from "./shortcuts";

const WORKSPACE_OPTIONS: readonly ChoiceOption<WorkspaceId>[] = [
  { value: "compose", label: "Compose", icon: "compose", shortcut: shortcutLabel("Mod+1") },
  { value: "drawings", label: "Drawings", icon: "drawings", shortcut: shortcutLabel("Mod+2") },
  { value: "boards", label: "Boards", icon: "boards", shortcut: shortcutLabel("Mod+3") },
];

/** The section/elevation callout, drawn as the ArchCompose mark. */
export function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 22 22" aria-hidden className={styles.mark}>
      <circle cx="11" cy="11" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.75 11a9.25 9.25 0 0 1 18.5 0Z" fill="var(--c-accent)" />
      <path d="M1 11h20" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function TopBar({
  onShowShortcuts,
  onShowLicenses,
}: {
  onShowShortcuts: () => void;
  onShowLicenses: () => void;
}) {
  const workspace = useAppStore((s) => s.workspace);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const undoEntry = useAppStore((s) => s.history.past.at(-1));
  const redoEntry = useAppStore((s) => s.history.future[0]);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const panels = useAppStore((s) => s.panels);
  const togglePanel = useAppStore((s) => s.togglePanel);

  return (
    <header className={styles.topbar}>
      <div className={styles.topLeft}>
        <div className={styles.brand}>
          <BrandMark />
          <span className={styles.wordmark}>ArchCompose</span>
        </div>
        <span className={styles.divider} aria-hidden />
        <nav className={styles.fileActions} aria-label="Project">
          <IconButton
            icon="file"
            label="New project"
            shortcut={shortcutLabel("Mod+N")}
            onClick={() => void newProject()}
          />
          <IconButton
            icon="folder"
            label="Open project"
            shortcut={shortcutLabel("Mod+O")}
            onClick={() => void openProject()}
          />
          <IconButton
            icon="save"
            label="Save project"
            shortcut={shortcutLabel("Mod+S")}
            onClick={() => void saveProject(false)}
          />
        </nav>
        <span className={styles.divider} aria-hidden />
        <div className={styles.fileActions}>
          <IconButton
            icon="undo"
            label={undoEntry ? `Undo ${undoEntry.label.toLowerCase()}` : "Nothing to undo"}
            shortcut={shortcutLabel("Mod+Z")}
            disabled={!undoEntry}
            onClick={undo}
          />
          <IconButton
            icon="redo"
            label={redoEntry ? `Redo ${redoEntry.label.toLowerCase()}` : "Nothing to redo"}
            shortcut={shortcutLabel("Mod+Shift+Z")}
            disabled={!redoEntry}
            onClick={redo}
          />
        </div>
      </div>

      <Segmented
        label="Workspace"
        value={workspace}
        options={WORKSPACE_OPTIONS}
        onChange={setWorkspace}
        className={styles.workspaceSwitch}
      />

      <div className={styles.topRight}>
        <IconButton
          icon="panelLeft"
          label={panels.left ? "Hide left panel" : "Show left panel"}
          shortcut={shortcutLabel("Mod+B")}
          pressed={panels.left}
          onClick={() => togglePanel("left")}
        />
        <IconButton
          icon="panelRight"
          label={panels.right ? "Hide inspector" : "Show inspector"}
          shortcut={shortcutLabel("Mod+Alt+B")}
          pressed={panels.right}
          onClick={() => togglePanel("right")}
        />
        <IconButton
          icon="keyboard"
          label="Keyboard shortcuts"
          shortcut="?"
          onClick={onShowShortcuts}
        />
        <IconButton icon="info" label="About and licenses" onClick={onShowLicenses} />
        <ProfileMenu />
      </div>
    </header>
  );
}
