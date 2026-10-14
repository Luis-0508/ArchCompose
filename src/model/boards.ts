import { createId } from "./ids";
import { replaceById } from "./project";
import type {
  Board,
  BoardFormat,
  BoardId,
  Frame,
  FrameContent,
  FrameId,
  LayoutGrid,
  Orientation,
  PaperPreset,
  Project,
} from "./types";

/** ISO 216 sheet sizes in millimetres, portrait. */
export const PAPER_SIZES: Record<Exclude<PaperPreset, "custom">, { w: number; h: number }> = {
  A0: { w: 841, h: 1189 },
  A1: { w: 594, h: 841 },
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
};

export const PAPER_PRESETS: readonly PaperPreset[] = ["A0", "A1", "A2", "A3", "A4", "custom"];

export const LIMITS = {
  sheetMm: { min: 50, max: 5000 },
  columns: { min: 1, max: 24 },
  rows: { min: 1, max: 24 },
  marginMm: { min: 0, max: 200 },
  gutterMm: { min: 0, max: 100 },
  targetDpi: { min: 50, max: 1200 },
} as const;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function formatFor(
  preset: PaperPreset,
  orientation: Orientation,
  custom?: { widthMm: number; heightMm: number },
): BoardFormat {
  if (preset === "custom") {
    const w = clamp(Math.round(custom?.widthMm ?? 1000), LIMITS.sheetMm.min, LIMITS.sheetMm.max);
    const h = clamp(Math.round(custom?.heightMm ?? 700), LIMITS.sheetMm.min, LIMITS.sheetMm.max);
    return {
      preset,
      orientation: w >= h ? "landscape" : "portrait",
      widthMm: w,
      heightMm: h,
    };
  }
  const size = PAPER_SIZES[preset];
  const [widthMm, heightMm] = orientation === "landscape" ? [size.h, size.w] : [size.w, size.h];
  return { preset, orientation, widthMm, heightMm };
}

export function addBoard(project: Project, name?: string): [Project, Board] {
  const board: Board = {
    id: createId("brd"),
    name: name ?? `Board ${project.boards.length + 1}`,
    format: formatFor("A1", "landscape"),
    grid: { columns: 6, rows: 4, marginMm: 20, gutterMm: 8 },
    targetDpi: 150,
    frames: [],
  };
  return [{ ...project, boards: [...project.boards, board] }, board];
}

export function updateBoard(
  project: Project,
  boardId: BoardId,
  update: (board: Board) => Board,
): Project {
  return { ...project, boards: replaceById(project.boards, boardId, update) };
}

export function renameBoard(project: Project, boardId: BoardId, name: string): Project {
  const trimmed = name.trim();
  return trimmed ? updateBoard(project, boardId, (b) => ({ ...b, name: trimmed })) : project;
}

export function removeBoard(project: Project, boardId: BoardId): Project {
  return { ...project, boards: project.boards.filter((b) => b.id !== boardId) };
}

export function setBoardFormat(project: Project, boardId: BoardId, format: BoardFormat): Project {
  return updateBoard(project, boardId, (b) => ({
    ...b,
    format: formatFor(format.preset, format.orientation, format),
  }));
}

export function setTargetDpi(project: Project, boardId: BoardId, dpi: number): Project {
  return updateBoard(project, boardId, (b) => ({
    ...b,
    targetDpi: Math.round(clamp(dpi, LIMITS.targetDpi.min, LIMITS.targetDpi.max)),
  }));
}

/** Changes the layout grid and pulls every frame back inside the new grid. */
export function setGrid(project: Project, boardId: BoardId, patch: Partial<LayoutGrid>): Project {
  return updateBoard(project, boardId, (b) => {
    const merged = { ...b.grid, ...patch };
    const grid: LayoutGrid = {
      columns: Math.round(clamp(merged.columns, LIMITS.columns.min, LIMITS.columns.max)),
      rows: Math.round(clamp(merged.rows, LIMITS.rows.min, LIMITS.rows.max)),
      marginMm: clamp(merged.marginMm, LIMITS.marginMm.min, LIMITS.marginMm.max),
      gutterMm: clamp(merged.gutterMm, LIMITS.gutterMm.min, LIMITS.gutterMm.max),
    };
    return { ...b, grid, frames: b.frames.map((f) => fitFrameToGrid(f, grid)) };
  });
}

function fitFrameToGrid(frame: Frame, grid: LayoutGrid): Frame {
  const colSpan = Math.round(clamp(frame.colSpan, 1, grid.columns));
  const rowSpan = Math.round(clamp(frame.rowSpan, 1, grid.rows));
  return {
    ...frame,
    colSpan,
    rowSpan,
    col: Math.round(clamp(frame.col, 0, grid.columns - colSpan)),
    row: Math.round(clamp(frame.row, 0, grid.rows - rowSpan)),
  };
}

export interface RectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Size of one grid cell. Can be zero or negative when margins and gutters exceed the sheet. */
export function cellSize(board: Board): { w: number; h: number } {
  const { columns, rows, marginMm, gutterMm } = board.grid;
  const contentW = board.format.widthMm - 2 * marginMm;
  const contentH = board.format.heightMm - 2 * marginMm;
  return {
    w: (contentW - (columns - 1) * gutterMm) / columns,
    h: (contentH - (rows - 1) * gutterMm) / rows,
  };
}

export function gridIsUsable(board: Board): boolean {
  const { w, h } = cellSize(board);
  return w >= 5 && h >= 5;
}

export function spanRect(
  board: Board,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
): RectMm {
  const { marginMm, gutterMm } = board.grid;
  const cell = cellSize(board);
  return {
    x: marginMm + col * (cell.w + gutterMm),
    y: marginMm + row * (cell.h + gutterMm),
    w: colSpan * cell.w + (colSpan - 1) * gutterMm,
    h: rowSpan * cell.h + (rowSpan - 1) * gutterMm,
  };
}

export function frameRect(board: Board, frame: Frame): RectMm {
  return spanRect(board, frame.col, frame.row, frame.colSpan, frame.rowSpan);
}

/** The grid cell under a sheet position, or the nearest one when the point is in a gutter. */
export function cellAt(board: Board, xMm: number, yMm: number): { col: number; row: number } {
  const { marginMm, gutterMm, columns, rows } = board.grid;
  const cell = cellSize(board);
  const col = Math.floor((xMm - marginMm + gutterMm / 2) / (cell.w + gutterMm));
  const row = Math.floor((yMm - marginMm + gutterMm / 2) / (cell.h + gutterMm));
  return { col: clamp(col, 0, columns - 1), row: clamp(row, 0, rows - 1) };
}

export function framesOverlap(a: Frame, b: Frame): boolean {
  return (
    a.col < b.col + b.colSpan &&
    b.col < a.col + a.colSpan &&
    a.row < b.row + b.rowSpan &&
    b.row < a.row + a.rowSpan
  );
}

/** First free top-left cell (row-major) that fits a frame of the given span, if any. */
export function findFreeCell(
  board: Board,
  colSpan = 1,
  rowSpan = 1,
): { col: number; row: number } | null {
  for (let row = 0; row + rowSpan <= board.grid.rows; row++) {
    for (let col = 0; col + colSpan <= board.grid.columns; col++) {
      const probe: Frame = { id: "", col, row, colSpan, rowSpan, content: { type: "empty" } };
      if (!board.frames.some((f) => framesOverlap(f, probe))) return { col, row };
    }
  }
  return null;
}

export function addFrame(
  project: Project,
  boardId: BoardId,
  content: FrameContent,
  placement: { col: number; row: number; colSpan?: number; rowSpan?: number },
): [Project, FrameId | null] {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) return [project, null];
  const frame = fitFrameToGrid(
    {
      id: createId("frm"),
      col: placement.col,
      row: placement.row,
      colSpan: placement.colSpan ?? 1,
      rowSpan: placement.rowSpan ?? 1,
      content,
    },
    board.grid,
  );
  return [updateBoard(project, boardId, (b) => ({ ...b, frames: [...b.frames, frame] })), frame.id];
}

export function updateFrame(
  project: Project,
  boardId: BoardId,
  frameId: FrameId,
  patch: Partial<Omit<Frame, "id">>,
): Project {
  return updateBoard(project, boardId, (b) => ({
    ...b,
    frames: replaceById(b.frames, frameId, (f) => fitFrameToGrid({ ...f, ...patch }, b.grid)),
  }));
}

export function removeFrame(project: Project, boardId: BoardId, frameId: FrameId): Project {
  return updateBoard(project, boardId, (b) => ({
    ...b,
    frames: b.frames.filter((f) => f.id !== frameId),
  }));
}

/**
 * Effective print resolution of an image placed in a frame.
 * `cover` fills the frame and crops, so the less-resolved axis decides.
 * `contain` fits the whole image, so the image is limited by the tighter axis.
 */
export function effectiveDpi(
  pxW: number,
  pxH: number,
  frameWmm: number,
  frameHmm: number,
  fit: "cover" | "contain",
): number {
  if (pxW <= 0 || pxH <= 0 || frameWmm <= 0 || frameHmm <= 0) return 0;
  const dpiX = (pxW / frameWmm) * 25.4;
  const dpiY = (pxH / frameHmm) * 25.4;
  return fit === "cover" ? Math.min(dpiX, dpiY) : Math.max(dpiX, dpiY);
}

export function formatLabel(format: BoardFormat): string {
  const size = `${format.widthMm} × ${format.heightMm} mm`;
  return format.preset === "custom"
    ? `Custom, ${size}`
    : `${format.preset} ${format.orientation}, ${size}`;
}
