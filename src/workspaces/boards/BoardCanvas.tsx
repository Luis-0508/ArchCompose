import type { PointerEvent as ReactPointerEvent } from "react";
import {
  addFrame,
  cellAt,
  cellSize,
  frameRect,
  gridIsUsable,
  spanRect,
  updateFrame,
} from "../../model/boards";
import type { Board, Frame, Project, TextRole } from "../../model/types";
import type { BoardIssue } from "../../model/validation";
import { useAssetSource } from "../../state/assetCache";
import { useAppStore } from "../../state/store";
import { contentToScreen, screenToContent, type Camera } from "../../viewport/camera";
import { Viewport, type ViewportPointer } from "../../viewport/Viewport";
import styles from "./boards.module.css";

export const boardViewKey = (board: Board) => `board:${board.id}`;

/** Type sizes for board text, in millimetres on the sheet. */
export const TEXT_SIZE_MM: Record<TextRole, number> = {
  title: 20,
  heading: 9,
  body: 4.2,
  caption: 3.2,
};

function AssetFill({ assetId, fit }: { assetId: string; fit: "cover" | "contain" }) {
  const source = useAssetSource(assetId);
  if (source?.status !== "ready") {
    return (
      <div className={styles.frameMissing}>
        {source?.status === "loading" ? "Loading" : "Image missing"}
      </div>
    );
  }
  return (
    <img
      src={source.url}
      alt=""
      draggable={false}
      className={styles.frameImage}
      style={{ objectFit: fit }}
    />
  );
}

function FrameContentView({ project, frame }: { project: Project; frame: Frame }) {
  const content = frame.content;
  switch (content.type) {
    case "empty":
      return <div className={styles.frameEmpty} />;
    case "asset":
      return project.assets[content.assetId] ? (
        <AssetFill assetId={content.assetId} fit={content.fit} />
      ) : (
        <div className={styles.frameMissing}>Image removed</div>
      );
    case "drawing": {
      const drawing = project.drawings.find((d) => d.id === content.drawingId);
      if (!drawing) return <div className={styles.frameMissing}>Drawing removed</div>;
      return (
        <div className={styles.drawingFrame}>
          <div className={styles.drawingArea}>
            {drawing.sourceAssetId ? (
              <AssetFill assetId={drawing.sourceAssetId} fit="contain" />
            ) : (
              <div className={styles.frameMissing}>No drawing file</div>
            )}
          </div>
          <div className={styles.drawingCaption} style={{ fontSize: TEXT_SIZE_MM.caption }}>
            <strong>{drawing.number}</strong>
            <span>{drawing.title}</span>
            <span>1:{drawing.scale}</span>
          </div>
        </div>
      );
    }
    case "text":
      return (
        <div
          className={`${styles.textFrame} ${styles[`text_${content.role}`]}`}
          style={{ fontSize: TEXT_SIZE_MM[content.role] }}
        >
          {content.text || <span className={styles.textPlaceholder}>Empty text</span>}
        </div>
      );
  }
}

interface BoardCanvasProps {
  board: Board;
  showGrid: boolean;
  issues: BoardIssue[];
}

export function BoardCanvas({ board, showGrid, issues }: BoardCanvasProps) {
  const project = useAppStore((s) => s.history.present);
  const frameId = useAppStore((s) => s.selection.frameId);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const { widthMm, heightMm } = board.format;
  const selected = board.frames.find((f) => f.id === frameId) ?? null;
  const usable = gridIsUsable(board);
  const errorFrames = new Set(issues.filter((i) => i.severity === "error").map((i) => i.frameId));

  const frameAt = (x: number, y: number) =>
    [...board.frames].reverse().find((f) => {
      const r = frameRect(board, f);
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });

  const track = (start: ReactPointerEvent, move: (e: PointerEvent) => void, end: () => void) => {
    const onMove = (e: PointerEvent) => move(e);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    start.preventDefault();
  };

  const onToolPointerDown = (pointer: ViewportPointer) => {
    const { x, y } = pointer.content;
    const insideSheet = x >= 0 && y >= 0 && x <= widthMm && y <= heightMm;
    const hit = frameAt(x, y);
    if (hit) {
      select({ frameId: hit.id });
      // Drag to another cell, keeping the grab offset in cells.
      const startCell = cellAt(board, x, y);
      const origin = { col: hit.col, row: hit.row };
      const rect = (pointer.event.currentTarget as HTMLElement).getBoundingClientRect();
      let moved = false;
      track(
        pointer.event,
        (e) => {
          const p = screenToContent(pointer.camera, {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
          const cell = cellAt(board, p.x, p.y);
          const col = origin.col + cell.col - startCell.col;
          const row = origin.row + cell.row - startCell.row;
          if (!moved && col === origin.col && row === origin.row) return;
          if (!moved) {
            moved = true;
            beginGesture();
          }
          applyTransient((proj) => updateFrame(proj, board.id, hit.id, { col, row }));
        },
        () => moved && endGesture("Move frame"),
      );
      return;
    }
    if (insideSheet && usable) {
      const cell = cellAt(board, x, y);
      let id: string | null = null;
      apply("Add frame", (p) => {
        const [next, newId] = addFrame(p, board.id, { type: "empty" }, cell);
        id = newId;
        return next;
      });
      select({ frameId: id });
      return;
    }
    select({ frameId: null });
  };

  const startResize = (event: ReactPointerEvent, camera: Camera) => {
    if (!selected) return;
    event.stopPropagation();
    const stage = (event.currentTarget as HTMLElement).closest(
      "[data-testid^='viewport-']",
    ) as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const frame = selected;
    beginGesture();
    track(
      event,
      (e) => {
        const p = screenToContent(camera, { x: e.clientX - rect.left, y: e.clientY - rect.top });
        const cell = cellAt(board, p.x, p.y);
        applyTransient((proj) =>
          updateFrame(proj, board.id, frame.id, {
            colSpan: Math.max(1, cell.col - frame.col + 1),
            rowSpan: Math.max(1, cell.row - frame.row + 1),
          }),
        );
      },
      () => endGesture("Resize frame"),
    );
  };

  const overlay = (camera: Camera) => {
    const items = [];
    for (const frame of board.frames) {
      if (!errorFrames.has(frame.id) || frame.id === selected?.id) continue;
      const r = frameRect(board, frame);
      const tl = contentToScreen(camera, { x: r.x, y: r.y });
      items.push(
        <div
          key={`err-${frame.id}`}
          className={styles.errorOutline}
          style={{ left: tl.x, top: tl.y, width: r.w * camera.zoom, height: r.h * camera.zoom }}
        />,
      );
    }
    if (selected) {
      const r = frameRect(board, selected);
      const tl = contentToScreen(camera, { x: r.x, y: r.y });
      items.push(
        <div
          key="selection"
          className={styles.selection}
          style={{ left: tl.x, top: tl.y, width: r.w * camera.zoom, height: r.h * camera.zoom }}
          data-testid="frame-selection"
        >
          <span className={`${styles.spanBadge} num`}>
            {selected.colSpan} × {selected.rowSpan}
          </span>
          <span
            className={styles.resizeHandle}
            onPointerDown={(e) => startResize(e, camera)}
            aria-hidden
          />
        </div>,
      );
    }
    return items;
  };

  const cell = cellSize(board);
  return (
    <Viewport
      viewKey={boardViewKey(board)}
      content={{ width: widthMm, height: heightMm }}
      unit="mm"
      label={`Board ${board.name}`}
      surface="desk"
      cursor="default"
      onToolPointerDown={onToolPointerDown}
      overlay={overlay}
    >
      <div
        className={styles.paper}
        style={{ width: widthMm, height: heightMm }}
        data-testid="board-paper"
      >
        {showGrid && usable ? (
          <div className={styles.grid} aria-hidden>
            <div
              className={styles.margin}
              style={{
                left: board.grid.marginMm,
                top: board.grid.marginMm,
                width: widthMm - 2 * board.grid.marginMm,
                height: heightMm - 2 * board.grid.marginMm,
              }}
            />
            {Array.from({ length: board.grid.rows }, (_, row) =>
              Array.from({ length: board.grid.columns }, (_, col) => {
                const r = spanRect(board, col, row, 1, 1);
                return (
                  <div
                    key={`${col}-${row}`}
                    className={styles.cell}
                    style={{ left: r.x, top: r.y, width: cell.w, height: cell.h }}
                  />
                );
              }),
            )}
          </div>
        ) : null}
        {board.frames.map((frame) => {
          const r = frameRect(board, frame);
          return (
            <div
              key={frame.id}
              className={styles.frame}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            >
              <FrameContentView project={project} frame={frame} />
            </div>
          );
        })}
      </div>
    </Viewport>
  );
}
