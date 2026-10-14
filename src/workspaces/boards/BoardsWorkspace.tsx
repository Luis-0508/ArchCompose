import { useMemo, useState } from "react";
import {
  addBoard,
  addFrame,
  findFreeCell,
  formatLabel,
  removeBoard,
  updateFrame,
} from "../../model/boards";
import type { AssetRef } from "../../model/types";
import { validateBoard } from "../../model/validation";
import { assetCache, useAssetCacheVersion } from "../../state/assetCache";
import { selectBoard, useAppStore } from "../../state/store";
import { Button, IconButton } from "../../ui/Button";
import { Tabs } from "../../ui/Choice";
import { EmptyState } from "../../ui/Panel";
import { AssetLibrary } from "../shared/AssetLibrary";
import { ViewControls } from "../shared/ViewControls";
import { WorkspaceLayout } from "../WorkspaceLayout";
import styles from "../workspace.module.css";
import { BoardCanvas, boardViewKey } from "./BoardCanvas";
import { BoardInspector } from "./BoardInspector";
import local from "./boards.module.css";

type LeftTab = "boards" | "library";

function useCreateBoard() {
  const apply = useAppStore((s) => s.apply);
  const select = useAppStore((s) => s.select);
  return () => {
    let id = "";
    apply("New board", (p) => {
      const [next, board] = addBoard(p);
      id = board.id;
      return next;
    });
    select({ boardId: id, frameId: null });
  };
}

function BoardList() {
  const boards = useAppStore((s) => s.history.present.boards);
  const current = useAppStore(selectBoard);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const createBoard = useCreateBoard();

  return (
    <div className={local.leftBody}>
      <div className={styles.scroll}>
        {boards.map((board, index) => (
          <div key={board.id} className={local.boardItem}>
            <button
              type="button"
              className={styles.row}
              aria-current={board.id === current?.id || undefined}
              onClick={() => select({ boardId: board.id, frameId: null })}
            >
              <span
                className={local.boardThumb}
                style={{ aspectRatio: `${board.format.widthMm} / ${board.format.heightMm}` }}
                aria-hidden
              />
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{board.name}</span>
                <span className={`${styles.rowMeta} num`}>
                  {formatLabel(board.format)}, {board.frames.length} frames
                </span>
              </span>
              <span className={`${local.boardIndex} num`}>{index + 1}</span>
            </button>
            <span className={local.boardActions}>
              <IconButton
                size="sm"
                icon="trash"
                label="Remove board"
                tooltipPlacement="left"
                onClick={async () => {
                  const ok = await requestConfirm({
                    title: `Remove “${board.name}”?`,
                    message:
                      "The board and its frames are removed. Images and drawings stay in the project.",
                    confirmLabel: "Remove board",
                  });
                  if (ok) apply("Remove board", (p) => removeBoard(p, board.id));
                }}
              />
            </span>
          </div>
        ))}
      </div>
      <div className={local.leftFoot}>
        <Button size="sm" icon="plus" onClick={createBoard}>
          New board
        </Button>
      </div>
    </div>
  );
}

function BoardsEmpty() {
  const createBoard = useCreateBoard();
  return (
    <div className={styles.centered}>
      <div className={local.empty}>
        <svg viewBox="0 0 200 142" className={local.emptySheet} aria-hidden>
          {/* An A-series sheet (1:√2) with a six-column layout grid. */}
          <rect x="1" y="1" width="198" height="140" className={local.emptyPaper} />
          {[0, 1, 2, 3, 4, 5].map((c) => (
            <rect
              key={c}
              x={10 + c * 30.5}
              y="10"
              width="27"
              height="122"
              className={local.emptyCol}
            />
          ))}
          <rect x="10" y="10" width="88" height="56" className={local.emptyFrame} />
        </svg>
        <h1 className={local.emptyTitle}>Lay out a board</h1>
        <p className={local.emptyBody}>
          Set up an A0 to A4 sheet with a layout grid, place renders, drawings and text in grid
          frames, and check effective print resolution before submission.
        </p>
        <Button variant="primary" icon="plus" onClick={createBoard}>
          New A1 board
        </Button>
      </div>
    </div>
  );
}

export function BoardsWorkspace() {
  const project = useAppStore((s) => s.history.present);
  const board = useAppStore(selectBoard);
  const frameId = useAppStore((s) => s.selection.frameId);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const notify = useAppStore((s) => s.notify);
  const [tab, setTab] = useState<LeftTab>("boards");
  const [showGrid, setShowGrid] = useState(true);
  const cacheVersion = useAssetCacheVersion();

  const issues = useMemo(
    () =>
      board
        ? validateBoard(project, board, { isAssetAvailable: (id) => assetCache.isReady(id) })
        : [],
    // cacheVersion re-runs the check when images finish loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, board, cacheVersion],
  );

  const placeAsset = (asset: AssetRef) => {
    if (!board) return;
    const content = { type: "asset" as const, assetId: asset.id, fit: "cover" as const };
    const target = board.frames.find((f) => f.id === frameId);
    if (target && target.content.type === "empty") {
      apply("Place image", (p) => updateFrame(p, board.id, target.id, { content }));
      return;
    }
    const cell = findFreeCell(board, 2, 2) ?? findFreeCell(board);
    if (!cell) {
      notify("error", "The board grid is full. Remove a frame or add grid cells.");
      return;
    }
    const span = findFreeCell(board, 2, 2) ? 2 : 1;
    let id: string | null = null;
    apply("Place image", (p) => {
      const [next, newId] = addFrame(p, board.id, content, {
        ...cell,
        colSpan: span,
        rowSpan: span,
      });
      id = newId;
      return next;
    });
    select({ frameId: id });
  };

  return (
    <WorkspaceLayout
      leftLabel="Boards and library"
      left={
        <>
          <Tabs
            idPrefix="boards-left"
            label="Panel"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "boards", label: "Boards", count: project.boards.length },
              { value: "library", label: "Library" },
            ]}
          />
          <div
            role="tabpanel"
            id={`boards-left-panel-${tab}`}
            aria-labelledby={`boards-left-tab-${tab}`}
            className={local.leftBody}
          >
            {tab === "boards" ? (
              <BoardList />
            ) : (
              <AssetLibrary
                importKind="image"
                placeLabel={board ? "Place on board" : undefined}
                onPlace={board ? placeAsset : undefined}
              />
            )}
          </div>
        </>
      }
      context={
        <>
          {board ? (
            <>
              <span className={local.contextName}>{board.name}</span>
              <span className={`${styles.contextLabel} num`}>{formatLabel(board.format)}</span>
              <span className={styles.contextRule} aria-hidden />
              <label className={local.toggle}>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                />
                Show layout grid
              </label>
              <span className={styles.contextRule} aria-hidden />
              <span className={styles.contextLabel}>Click an empty cell to add a frame.</span>
            </>
          ) : (
            <span className={styles.contextLabel}>No board yet.</span>
          )}
          <span className={styles.contextSpacer} />
          <ViewControls viewKey={board ? boardViewKey(board) : null} />
        </>
      }
      center={
        board ? (
          <BoardCanvas key={board.id} board={board} showGrid={showGrid} issues={issues} />
        ) : (
          <BoardsEmpty />
        )
      }
      rightLabel="Board properties"
      right={
        board ? (
          <BoardInspector board={board} issues={issues} />
        ) : (
          <div className={styles.inspectorEmpty}>
            <EmptyState compact title="No board">
              <p>Format, grid and the submission check appear here.</p>
            </EmptyState>
          </div>
        )
      }
    />
  );
}
