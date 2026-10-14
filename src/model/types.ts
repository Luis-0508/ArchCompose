/**
 * The ArchCompose document model.
 *
 * Everything here is plain, serializable data. It must not reference React,
 * the DOM, Tauri, or any image engine. Pixel data never lives in the model:
 * assets are referenced by id and resolved at runtime (see state/assetCache).
 */

/** Version 2 replaced a drawing's `sourceAssetId` with a sheet, an underlay and elements. */
export const PROJECT_SCHEMA_VERSION = 2;

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

/**
 * Non-destructive tone and colour adjustments of a layer, in Photoshop's units as the
 * image engine implements them. The source file is never changed.
 */
export interface LayerAdjustments {
  /** Stops, -5 to 5. */
  exposure: number;
  /** -150 to 150. */
  brightness: number;
  /** -50 to 100. */
  contrast: number;
  /** -100 to 100. */
  saturation: number;
}

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
  /** Absent when the layer has no adjustments. */
  adjust?: LayerAdjustments;
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

export type ElementId = string;

/** Real-world unit used to report lengths at the drawing's scale. */
export type DrawingUnit = "mm" | "cm" | "m";

/**
 * The physical sheet of a drawing. Three measures stay separate: the paper size in
 * millimetres, the drawing scale (paper millimetres to real-world length) and, for an
 * attached image, its resolution on the sheet in dots per inch.
 */
export interface DrawingSheet {
  format: PaperFormat;
  grid: {
    visible: boolean;
    /** Grid spacing in paper millimetres. */
    spacingMm: number;
    snap: boolean;
  };
  rulers: boolean;
  unit: DrawingUnit;
}

/**
 * An image file placed on the sheet as an underlay, for example an exported plan to
 * annotate. Position is the image's top-left corner in paper millimetres.
 */
export interface DrawingUnderlay {
  assetId: AssetId;
  xMm: number;
  yMm: number;
  /** Image pixels per inch of paper; sets the printed size of the image. */
  dpi: number;
  opacity: number;
}

/** Stroke appearance. Widths are paper millimetres, so they print at the same weight. */
export interface StrokeStyle {
  /** sRGB hex colour, "#rrggbb". */
  color: string;
  widthMm: number;
  opacity: number;
}

/** A point in paper millimetres, origin at the sheet's top-left corner. */
export type SheetPoint = [x: number, y: number];

interface ElementBase {
  id: ElementId;
  stroke: StrokeStyle;
}

export type DrawingElement =
  | (ElementBase & { type: "path"; points: SheetPoint[] })
  | (ElementBase & { type: "line"; from: SheetPoint; to: SheetPoint })
  | (ElementBase & { type: "polyline"; points: SheetPoint[]; closed: boolean })
  | (ElementBase & { type: "rect"; x: number; y: number; w: number; h: number })
  | (ElementBase & { type: "ellipse"; cx: number; cy: number; rx: number; ry: number })
  | (ElementBase & {
      type: "text";
      /** Left end of the first line's baseline. */
      x: number;
      y: number;
      text: string;
      /** Font size (em height) in paper millimetres. */
      sizeMm: number;
    });

export type DrawingElementType = DrawingElement["type"];

export interface Drawing {
  id: DrawingId;
  /** Sheet number such as "A-101". */
  number: string;
  title: string;
  kind: DrawingKind;
  /** Scale denominator: 100 means 1:100. */
  scale: number;
  level: string;
  sheet: DrawingSheet;
  underlay: DrawingUnderlay | null;
  /** Bottom-to-top drawing order. */
  elements: DrawingElement[];
  revisions: Revision[];
}

// ---------------------------------------------------------------- Boards

export type PaperPreset = "A0" | "A1" | "A2" | "A3" | "A4" | "custom";
export type Orientation = "portrait" | "landscape";

export interface PaperFormat {
  preset: PaperPreset;
  orientation: Orientation;
  /** Effective sheet size in millimetres, orientation already applied. */
  widthMm: number;
  heightMm: number;
}

export type BoardFormat = PaperFormat;

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
