import { clamp, formatFor } from "./boards";
import { createId } from "./ids";
import { replaceById } from "./project";
import type {
  AssetRef,
  Drawing,
  DrawingElement,
  DrawingId,
  DrawingSheet,
  DrawingUnderlay,
  DrawingUnit,
  ElementId,
  PaperFormat,
  Project,
  SheetPoint,
  StrokeStyle,
} from "./types";

/**
 * Drawing sheets and their editable content. All coordinates are paper millimetres
 * with the origin at the sheet's top-left corner; real-world lengths come from the
 * drawing scale, and image resolution only matters for the underlay.
 */

export const MM_PER_INCH = 25.4;

export const SHEET_LIMITS = {
  gridMm: { min: 1, max: 100 },
  strokeMm: { min: 0.05, max: 20 },
  textMm: { min: 1, max: 200 },
  underlayDpi: { min: 10, max: 2400 },
} as const;

export const DEFAULT_STROKE: StrokeStyle = { color: "#1b1d20", widthMm: 0.35, opacity: 1 };

/** Common pen widths in millimetres (ISO 128 line widths). */
export const PEN_WIDTHS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2] as const;

export function defaultSheet(format: PaperFormat = formatFor("A3", "landscape")): DrawingSheet {
  return {
    format,
    grid: { visible: true, spacingMm: 10, snap: false },
    rulers: true,
    unit: "m",
  };
}

// ---------------------------------------------------------------- units

const UNIT_MM: Record<DrawingUnit, number> = { mm: 1, cm: 10, m: 1000 };

/** Real-world length of a paper length at a scale of 1:`scale`, in `unit`. */
export function paperToReal(paperMm: number, scale: number, unit: DrawingUnit): number {
  return (paperMm * scale) / UNIT_MM[unit];
}

export function realToPaper(real: number, scale: number, unit: DrawingUnit): number {
  return (real * UNIT_MM[unit]) / scale;
}

export function formatReal(paperMm: number, scale: number, unit: DrawingUnit): string {
  const value = paperToReal(paperMm, scale, unit);
  const decimals = unit === "m" ? 2 : unit === "cm" ? 1 : 0;
  return `${value.toFixed(decimals)} ${unit}`;
}

// ---------------------------------------------------------------- underlay

/** Places an image centred on the sheet at the resolution that makes it fit inside a margin. */
export function fitUnderlay(
  format: PaperFormat,
  asset: Pick<AssetRef, "id" | "width" | "height">,
  marginMm = 10,
): DrawingUnderlay {
  const availW = Math.max(1, format.widthMm - marginMm * 2);
  const availH = Math.max(1, format.heightMm - marginMm * 2);
  const dpi = clamp(
    Math.max(asset.width / (availW / MM_PER_INCH), asset.height / (availH / MM_PER_INCH)),
    SHEET_LIMITS.underlayDpi.min,
    SHEET_LIMITS.underlayDpi.max,
  );
  const size = underlaySizeMm(asset, dpi);
  return {
    assetId: asset.id,
    xMm: round2((format.widthMm - size.w) / 2),
    yMm: round2((format.heightMm - size.h) / 2),
    dpi: round2(dpi),
    opacity: 1,
  };
}

export function underlaySizeMm(asset: Pick<AssetRef, "width" | "height">, dpi: number) {
  return { w: (asset.width / dpi) * MM_PER_INCH, h: (asset.height / dpi) * MM_PER_INCH };
}

/** Picks a sheet orientation that matches an image's aspect ratio. */
export function sheetForImage(asset: Pick<AssetRef, "width" | "height">): PaperFormat {
  return formatFor("A1", asset.width >= asset.height ? "landscape" : "portrait");
}

// ---------------------------------------------------------------- project updates

export function updateDrawingById(
  project: Project,
  id: DrawingId,
  update: (drawing: Drawing) => Drawing,
): Project {
  return { ...project, drawings: replaceById(project.drawings, id, update) };
}

export function setSheet(
  project: Project,
  id: DrawingId,
  patch: Partial<Omit<DrawingSheet, "grid">> & { grid?: Partial<DrawingSheet["grid"]> },
): Project {
  return updateDrawingById(project, id, (d) => {
    const grid = { ...d.sheet.grid, ...patch.grid };
    grid.spacingMm = clamp(grid.spacingMm, SHEET_LIMITS.gridMm.min, SHEET_LIMITS.gridMm.max);
    return { ...d, sheet: { ...d.sheet, ...patch, grid } };
  });
}

/**
 * Changes the paper format. Content keeps its paper coordinates; the underlay keeps its
 * resolution. Content that falls outside a smaller sheet stays editable.
 */
export function setSheetFormat(project: Project, id: DrawingId, format: PaperFormat): Project {
  return updateDrawingById(project, id, (d) => ({ ...d, sheet: { ...d.sheet, format } }));
}

export function setUnderlay(
  project: Project,
  id: DrawingId,
  underlay: DrawingUnderlay | null,
): Project {
  return updateDrawingById(project, id, (d) => ({
    ...d,
    underlay: underlay && {
      ...underlay,
      dpi: clamp(underlay.dpi, SHEET_LIMITS.underlayDpi.min, SHEET_LIMITS.underlayDpi.max),
      opacity: clamp(underlay.opacity, 0, 1),
    },
  }));
}

export function addElements(
  project: Project,
  id: DrawingId,
  elements: readonly DrawingElement[],
): Project {
  if (elements.length === 0) return project;
  return updateDrawingById(project, id, (d) => ({
    ...d,
    elements: [...d.elements, ...elements],
  }));
}

export function updateElements(
  project: Project,
  id: DrawingId,
  ids: readonly ElementId[],
  update: (element: DrawingElement) => DrawingElement,
): Project {
  if (ids.length === 0) return project;
  const set = new Set(ids);
  return updateDrawingById(project, id, (d) => ({
    ...d,
    elements: d.elements.map((e) => (set.has(e.id) ? update(e) : e)),
  }));
}

export function removeElements(
  project: Project,
  id: DrawingId,
  ids: readonly ElementId[],
): Project {
  if (ids.length === 0) return project;
  const set = new Set(ids);
  return updateDrawingById(project, id, (d) => ({
    ...d,
    elements: d.elements.filter((e) => !set.has(e.id)),
  }));
}

export function replaceElements(
  project: Project,
  id: DrawingId,
  elements: DrawingElement[],
): Project {
  return updateDrawingById(project, id, (d) => (d.elements === elements ? d : { ...d, elements }));
}

/** Moves elements to the front (`1`) or back (`-1`) of the drawing order, keeping their order. */
export function arrangeElements(
  project: Project,
  id: DrawingId,
  ids: readonly ElementId[],
  direction: 1 | -1,
): Project {
  const set = new Set(ids);
  return updateDrawingById(project, id, (d) => {
    const moving = d.elements.filter((e) => set.has(e.id));
    const rest = d.elements.filter((e) => !set.has(e.id));
    return { ...d, elements: direction > 0 ? [...rest, ...moving] : [...moving, ...rest] };
  });
}

export function normalizeStroke(stroke: StrokeStyle): StrokeStyle {
  return {
    color: /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color.toLowerCase() : DEFAULT_STROKE.color,
    widthMm: clamp(stroke.widthMm, SHEET_LIMITS.strokeMm.min, SHEET_LIMITS.strokeMm.max),
    opacity: clamp(stroke.opacity, 0, 1),
  };
}

export function setElementStroke(
  project: Project,
  id: DrawingId,
  ids: readonly ElementId[],
  patch: Partial<StrokeStyle>,
): Project {
  return updateElements(project, id, ids, (e) => ({
    ...e,
    stroke: normalizeStroke({ ...e.stroke, ...patch }),
  }));
}

// ---------------------------------------------------------------- element constructors

const round2 = (v: number) => Math.round(v * 100) / 100;
const pt = (p: SheetPoint): SheetPoint => [round2(p[0]), round2(p[1])];

export function makePath(points: readonly SheetPoint[], stroke: StrokeStyle): DrawingElement {
  return { id: createId("el"), type: "path", stroke, points: points.map(pt) };
}

export function makeLine(from: SheetPoint, to: SheetPoint, stroke: StrokeStyle): DrawingElement {
  return { id: createId("el"), type: "line", stroke, from: pt(from), to: pt(to) };
}

export function makePolyline(
  points: readonly SheetPoint[],
  closed: boolean,
  stroke: StrokeStyle,
): DrawingElement {
  return { id: createId("el"), type: "polyline", stroke, points: points.map(pt), closed };
}

/** A rectangle spanned by two corners in any order. */
export function makeRect(a: SheetPoint, b: SheetPoint, stroke: StrokeStyle): DrawingElement {
  return {
    id: createId("el"),
    type: "rect",
    stroke,
    x: round2(Math.min(a[0], b[0])),
    y: round2(Math.min(a[1], b[1])),
    w: round2(Math.abs(b[0] - a[0])),
    h: round2(Math.abs(b[1] - a[1])),
  };
}

export function makeCircle(
  center: SheetPoint,
  radius: number,
  stroke: StrokeStyle,
): DrawingElement {
  const r = round2(Math.abs(radius));
  return {
    id: createId("el"),
    type: "ellipse",
    stroke,
    cx: round2(center[0]),
    cy: round2(center[1]),
    rx: r,
    ry: r,
  };
}

export function makeText(
  at: SheetPoint,
  text: string,
  sizeMm: number,
  stroke: StrokeStyle,
): DrawingElement {
  return {
    id: createId("el"),
    type: "text",
    stroke,
    x: round2(at[0]),
    y: round2(at[1]),
    text,
    sizeMm: clamp(sizeMm, SHEET_LIMITS.textMm.min, SHEET_LIMITS.textMm.max),
  };
}

// ---------------------------------------------------------------- geometry

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Average advance of a character relative to the font size, for text bounds. */
export const TEXT_ADVANCE = 0.56;
export const TEXT_LINE_HEIGHT = 1.25;

function boundsOf(points: readonly SheetPoint[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function textLines(text: string): string[] {
  return text.split("\n");
}

/** Geometric bounds, without stroke width. Text bounds are an estimate from character count. */
export function elementBounds(element: DrawingElement): Rect {
  switch (element.type) {
    case "path":
    case "polyline":
      return boundsOf(element.points);
    case "line":
      return boundsOf([element.from, element.to]);
    case "rect":
      return { x: element.x, y: element.y, w: element.w, h: element.h };
    case "ellipse":
      return {
        x: element.cx - element.rx,
        y: element.cy - element.ry,
        w: element.rx * 2,
        h: element.ry * 2,
      };
    case "text": {
      const lines = textLines(element.text);
      const longest = Math.max(1, ...lines.map((l) => l.length));
      return {
        x: element.x,
        y: element.y - element.sizeMm * 0.8,
        w: longest * element.sizeMm * TEXT_ADVANCE,
        h: element.sizeMm * (0.8 + (lines.length - 1) * TEXT_LINE_HEIGHT + 0.25),
      };
    }
  }
}

export function unionBounds(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Applies `x' = origin + (x - origin) * s + d` to every coordinate of an element. */
export function transformElement(
  element: DrawingElement,
  t: { sx: number; sy: number; dx: number; dy: number; ox: number; oy: number },
): DrawingElement {
  const fx = (x: number) => round2(t.ox + (x - t.ox) * t.sx + t.dx);
  const fy = (y: number) => round2(t.oy + (y - t.oy) * t.sy + t.dy);
  const fp = (p: SheetPoint): SheetPoint => [fx(p[0]), fy(p[1])];
  switch (element.type) {
    case "path":
    case "polyline":
      return { ...element, points: element.points.map(fp) };
    case "line":
      return { ...element, from: fp(element.from), to: fp(element.to) };
    case "rect": {
      const a = fp([element.x, element.y]);
      const b = fp([element.x + element.w, element.y + element.h]);
      return {
        ...element,
        x: Math.min(a[0], b[0]),
        y: Math.min(a[1], b[1]),
        w: round2(Math.abs(b[0] - a[0])),
        h: round2(Math.abs(b[1] - a[1])),
      };
    }
    case "ellipse":
      return {
        ...element,
        cx: fx(element.cx),
        cy: fy(element.cy),
        rx: round2(Math.abs(element.rx * t.sx)),
        ry: round2(Math.abs(element.ry * t.sy)),
      };
    case "text": {
      // Text scales uniformly, by the larger factor, from its anchor.
      const s = Math.max(Math.abs(t.sx), Math.abs(t.sy));
      return {
        ...element,
        x: fx(element.x),
        y: fy(element.y),
        sizeMm: clamp(round2(element.sizeMm * s), SHEET_LIMITS.textMm.min, SHEET_LIMITS.textMm.max),
      };
    }
  }
}

export function translateElement(element: DrawingElement, dx: number, dy: number): DrawingElement {
  return transformElement(element, { sx: 1, sy: 1, dx, dy, ox: 0, oy: 0 });
}

export function distanceToSegment(p: SheetPoint, a: SheetPoint, b: SheetPoint): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2, 0, 1);
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Samples an ellipse as a closed polygon with enough points for its size. */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number): SheetPoint[] {
  const n = clamp(Math.ceil(Math.max(rx, ry) * 1.5), 24, 360);
  return Array.from({ length: n }, (_, i): SheetPoint => {
    const a = (i / n) * Math.PI * 2;
    return [round2(cx + Math.cos(a) * rx), round2(cy + Math.sin(a) * ry)];
  });
}

/**
 * The element's outline as polylines in paper millimetres. Text has no outline here.
 * Used for hit testing and erasing.
 */
export function elementOutline(
  element: DrawingElement,
): { points: SheetPoint[]; closed: boolean } | null {
  switch (element.type) {
    case "path":
      return { points: element.points, closed: false };
    case "polyline":
      return { points: element.points, closed: element.closed };
    case "line":
      return { points: [element.from, element.to], closed: false };
    case "rect": {
      const { x, y, w, h } = element;
      return {
        points: [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
        closed: true,
      };
    }
    case "ellipse":
      return {
        points: ellipsePoints(element.cx, element.cy, element.rx, element.ry),
        closed: true,
      };
    case "text":
      return null;
  }
}

function distanceToOutline(p: SheetPoint, points: readonly SheetPoint[], closed: boolean): number {
  if (points.length === 1) return Math.hypot(p[0] - points[0]![0], p[1] - points[0]![1]);
  let best = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    best = Math.min(best, distanceToSegment(p, points[i]!, points[(i + 1) % points.length]!));
  }
  return best;
}

function contains(rect: Rect, p: SheetPoint, pad = 0): boolean {
  return (
    p[0] >= rect.x - pad &&
    p[0] <= rect.x + rect.w + pad &&
    p[1] >= rect.y - pad &&
    p[1] <= rect.y + rect.h + pad
  );
}

/** Topmost element whose ink is within `tolerance` millimetres of a point. */
export function hitTestElements(
  elements: readonly DrawingElement[],
  p: SheetPoint,
  tolerance: number,
): DrawingElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]!;
    const reach = tolerance + element.stroke.widthMm / 2;
    if (element.type === "text") {
      if (contains(elementBounds(element), p, tolerance)) return element;
      continue;
    }
    if (!contains(elementBounds(element), p, reach)) continue;
    const outline = elementOutline(element)!;
    if (distanceToOutline(p, outline.points, outline.closed) <= reach) return element;
  }
  return null;
}

/** Elements whose bounds lie completely inside a rectangle. */
export function elementsInRect(elements: readonly DrawingElement[], rect: Rect): ElementId[] {
  return elements
    .filter((e) => {
      const b = elementBounds(e);
      return (
        b.x >= rect.x &&
        b.y >= rect.y &&
        b.x + b.w <= rect.x + rect.w &&
        b.y + b.h <= rect.y + rect.h
      );
    })
    .map((e) => e.id);
}

export function snapToGrid(p: SheetPoint, spacingMm: number): SheetPoint {
  return [Math.round(p[0] / spacingMm) * spacingMm, Math.round(p[1] / spacingMm) * spacingMm];
}

/** Constrains `p` relative to `origin` to the nearest multiple of 45°. */
export function constrainAngle(origin: SheetPoint, p: SheetPoint): SheetPoint {
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [origin[0] + Math.cos(angle) * length, origin[1] + Math.sin(angle) * length];
}

/** Ramer–Douglas–Peucker simplification of a freehand stroke. */
export function simplifyPath(points: readonly SheetPoint[], tolerance: number): SheetPoint[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let index = -1;
    let max = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i]!, points[start]!, points[end]!);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Length of an element's outline in paper millimetres; text has none. */
export function elementLength(element: DrawingElement): number {
  const outline = elementOutline(element);
  if (!outline) return 0;
  const { points, closed } = outline;
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

// ---------------------------------------------------------------- eraser

/** Splits a polyline into a list of points every `step` millimetres or closer. */
function densify(points: readonly SheetPoint[], closed: boolean, step: number): SheetPoint[] {
  const out: SheetPoint[] = [];
  const count = closed ? points.length : points.length - 1;
  if (points.length === 1) return [points[0]!];
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) {
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  out.push(closed ? points[0]! : points[points.length - 1]!);
  return out;
}

/**
 * Erases ink within `radius` millimetres of the eraser track. Lines, paths, polylines,
 * rectangles and circles are cut where the eraser passed; the remaining pieces become
 * separate strokes with the same style. Text is not affected; delete it with the select
 * tool. Elements that the eraser does not touch keep their identity, and when nothing is
 * touched the input array itself is returned.
 */
export function eraseElements(
  elements: DrawingElement[],
  track: readonly SheetPoint[],
  radius: number,
): DrawingElement[] {
  if (track.length === 0) return elements;
  let changed = false;
  const trackBounds = boundsOf(track);
  const touched = (p: SheetPoint, reach: number) => {
    if (!contains(trackBounds, p, reach)) return false;
    return distanceToOutline(p, track, false) <= reach;
  };
  const out: DrawingElement[] = [];
  for (const element of elements) {
    const outline = elementOutline(element);
    const reach = radius + element.stroke.widthMm / 2;
    const b = elementBounds(element);
    if (
      !outline ||
      b.x - reach > trackBounds.x + trackBounds.w ||
      b.x + b.w + reach < trackBounds.x ||
      b.y - reach > trackBounds.y + trackBounds.h ||
      b.y + b.h + reach < trackBounds.y
    ) {
      out.push(element);
      continue;
    }
    const dense = densify(outline.points, outline.closed, Math.max(0.1, radius / 3));
    const hit = dense.map((p) => touched(p, reach));
    if (!hit.some(Boolean)) {
      out.push(element);
      continue;
    }
    changed = true;
    // Collect the runs of untouched points. For a closed outline, a run that wraps
    // around the start is joined into one piece.
    const runs: SheetPoint[][] = [];
    let current: SheetPoint[] = [];
    dense.forEach((p, i) => {
      if (hit[i]) {
        if (current.length > 0) runs.push(current);
        current = [];
      } else current.push(p);
    });
    if (current.length > 0) runs.push(current);
    if (outline.closed && runs.length > 1 && !hit[0] && !hit[dense.length - 1]) {
      const last = runs.pop()!;
      runs[0] = [...last, ...runs[0]!];
    }
    for (const run of runs) {
      const simplified = simplifyPath(run, 0.02);
      if (simplified.length < 2) continue;
      const piece =
        element.type === "path"
          ? makePath(simplified, element.stroke)
          : makePolyline(simplified, false, element.stroke);
      out.push(piece);
    }
  }
  return changed ? out : elements;
}

export function emptyDrawingContent(drawing: Drawing): boolean {
  return drawing.elements.length === 0 && drawing.underlay === null;
}
