/**
 * The ArchCompose document model.
 *
 * Everything here is plain, serializable data. It must not reference React,
 * the DOM, Tauri, or any image engine. Pixel data never lives in the model:
 * assets are referenced by id and resolved at runtime (see state/assetCache).
 */

export const PROJECT_SCHEMA_VERSION = 1;

export type AssetId = string;
export type ComposeDocId = string;
export type LayerId = string;
export type DrawingId = string;
export type BoardId = string;
export type FrameId = string;

export type AssetKind = "render" | "cutout" | "drawing" | "image";

/** A reference to an image file on disk. Pixels are never stored in the project. */
export interface AssetRef {
  id: AssetId;
  name: string;
  kind: AssetKind;
  /** Absolute path on disk. Absent when the asset was added in a browser session. */
  path?: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  addedAt: string;
}

// ---------------------------------------------------------------- Compose

export interface ComposeLayer {
  id: LayerId;
  name: string;
  assetId: AssetId;
  /** Position of the layer's top-left corner in document pixels. */
  x: number;
  y: number;
  /** Uniform scale relative to the asset's native pixel size. */
  scale: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface ComposeDoc {
  id: ComposeDocId;
  name: string;
  /** Canvas size in pixels, taken from the base render. */
  width: number;
  height: number;
  /** Bottom-to-top. The first layer is normally the base render. */
  layers: ComposeLayer[];
  /** Manual horizon guide in document pixels; a visual aid, not a calibration. */
  horizonY: number | null;
}

// ---------------------------------------------------------------- Drawings

export type DrawingKind = "plan" | "section" | "elevation" | "site" | "detail";

export interface Revision {
  code: string;
  date: string;
  note: string;
}

export interface Drawing {
  id: DrawingId;
  /** Sheet number such as "A-101". */
  number: string;
  title: string;
  kind: DrawingKind;
  /** Scale denominator: 100 means 1:100. */
  scale: number;
  level: string;
  sourceAssetId: AssetId | null;
  revisions: Revision[];
}

// ---------------------------------------------------------------- Boards

export type PaperPreset = "A0" | "A1" | "A2" | "A3" | "A4" | "custom";
export type Orientation = "portrait" | "landscape";

export interface BoardFormat {
  preset: PaperPreset;
  orientation: Orientation;
  /** Effective sheet size in millimetres, orientation already applied. */
  widthMm: number;
  heightMm: number;
}

export interface LayoutGrid {
  columns: number;
  rows: number;
  marginMm: number;
  gutterMm: number;
}

export type TextRole = "title" | "heading" | "body" | "caption";

export type FrameContent =
  | { type: "empty" }
  | { type: "asset"; assetId: AssetId; fit: "cover" | "contain" }
  | { type: "drawing"; drawingId: DrawingId }
  | { type: "text"; role: TextRole; text: string };

export interface Frame {
  id: FrameId;
  /** Zero-based grid cell of the frame's top-left corner. */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  content: FrameContent;
}

export interface Board {
  id: BoardId;
  name: string;
  format: BoardFormat;
  grid: LayoutGrid;
  /** Minimum effective resolution for placed images, used by the submission check. */
  targetDpi: number;
  frames: Frame[];
}

// ---------------------------------------------------------------- Project

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  assets: Record<AssetId, AssetRef>;
  /** Library order. */
  assetOrder: AssetId[];
  composeDocs: ComposeDoc[];
  drawings: Drawing[];
  boards: Board[];
}
