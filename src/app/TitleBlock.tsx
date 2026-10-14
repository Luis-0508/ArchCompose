import { useEffect, useState, type ReactNode } from "react";
import { formatLabel } from "../model/boards";
import { renameProject } from "../model/project";
import { platform, type EngineStatus } from "../platform";
import {
  selectBoard,
  selectComposeDoc,
  selectDrawing,
  selectIsDirty,
  useAppStore,
} from "../state/store";
import { Tooltip } from "../ui/Tooltip";
import { formatZoom } from "../viewport/camera";
import styles from "./App.module.css";

function Cell({
  caption,
  children,
  grow,
  testId,
}: {
  caption: string;
  children: ReactNode;
  grow?: boolean;
  testId?: string;
}) {
  return (
    <div className={`${styles.cell} ${grow ? styles.cellGrow : ""}`} data-testid={testId}>
      <span className={styles.cellCaption}>{caption}</span>
      <span className={styles.cellValue}>{children}</span>
    </div>
  );
}

function ProjectName() {
  const name = useAppStore((s) => s.history.present.name);
  const dirty = useAppStore(selectIsDirty);
  const apply = useAppStore((s) => s.apply);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft.trim() && draft !== name) apply("Rename project", (p) => renameProject(p, draft));
    };
    return (
      <input
        className={styles.projectInput}
        aria-label="Project name"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <Tooltip label="Rename project" placement="top">
      <button
        type="button"
        className={styles.projectName}
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
      >
        <span className={styles.projectText}>{name}</span>
        {dirty ? <span className={styles.unsaved} aria-label="Unsaved changes" role="img" /> : null}
      </button>
    </Tooltip>
  );
}

/**
 * The status bar, laid out like the title block of a drawing sheet: project,
 * sheet, format, scale or zoom, cursor and renderer, each in its own cell.
 */
export function TitleBlock() {
  const workspace = useAppStore((s) => s.workspace);
  const composeDoc = useAppStore(selectComposeDoc);
  const drawing = useAppStore(selectDrawing);
  const board = useAppStore(selectBoard);
  const cursor = useAppStore((s) => s.cursor);
  const filePath = useAppStore((s) => s.filePath);
  const viewKey =
    workspace === "compose"
      ? composeDoc && `compose:${composeDoc.id}`
      : workspace === "drawings"
        ? drawing && `drawing:${drawing.id}`
        : board && `board:${board.id}`;
  const view = useAppStore((s) => (viewKey ? s.views[viewKey] : undefined));
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  useEffect(() => {
    platform.engineStatus().then(setEngine, (error: unknown) => {
      setEngineError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  let sheet = "None";
  let format = "None";
  if (workspace === "compose" && composeDoc) {
    sheet = composeDoc.name;
    format = `${composeDoc.width} × ${composeDoc.height} px`;
  } else if (workspace === "drawings" && drawing) {
    sheet = `${drawing.number} ${drawing.title}`;
    format = `1:${drawing.scale}`;
  } else if (workspace === "boards" && board) {
    sheet = board.name;
    format = formatLabel(board.format);
  }

  const cursorText = cursor
    ? `${cursor.x.toFixed(cursor.unit === "mm" ? 1 : 0)}, ${cursor.y.toFixed(cursor.unit === "mm" ? 1 : 0)} ${cursor.unit}`
    : "Off canvas";

  return (
    <footer className={styles.titleblock} aria-label="Document status">
      <Cell caption={filePath ? filePath : "Project, not saved yet"} grow>
        <ProjectName />
      </Cell>
      <Cell caption="Sheet" grow testId="tb-sheet">
        {sheet}
      </Cell>
      <Cell caption={workspace === "drawings" ? "Scale" : "Format"} testId="tb-format">
        {format}
      </Cell>
      <Cell caption="Zoom" testId="tb-zoom">
        <span className="num">{view ? formatZoom(view.camera.zoom) : "None"}</span>
      </Cell>
      <Cell caption="Cursor">
        <span className={`num ${styles.cursorValue}`}>{cursorText}</span>
      </Cell>
      <Cell caption="Renderer" testId="tb-engine">
        {engineError ? (
          <span className={styles.engineError}>Unavailable: {engineError}</span>
        ) : engine ? (
          <Tooltip
            placement="top"
            label={engine.engineLinked ? "Image engine linked" : "No image engine linked"}
            note="What you see is a preview drawn by the system web view. Export, masks and adjustments need the image engine."
          >
            <span tabIndex={0} className={styles.engine}>
              <span
                className={engine.engineLinked ? styles.engineOn : styles.engineOff}
                aria-hidden
              />
              {engine.renderer}
            </span>
          </Tooltip>
        ) : (
          "Checking"
        )}
      </Cell>
      <div className={styles.stamp} aria-label={`ArchCompose version ${engine?.appVersion ?? ""}`}>
        <span>ArchCompose</span>
        <span className="num">{engine?.appVersion ?? ""}</span>
      </div>
    </footer>
  );
}
