/**
 * Viewport camera math. Content units are pixels for Compose and millimetres for
 * Drawings and Boards; the camera does not care which.
 *
 *   screen = content × zoom + offset
 */
export interface Camera {
  zoom: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;

/** Preferred zoom stops for stepping in and out, as fractions of 100%. */
export const ZOOM_STOPS = [
  0.01, 0.02, 0.03, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8,
  12, 16, 24, 32, 48, 64,
];

export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, zoom));
}

export function fitCamera(content: Size, view: Size, padding = 40, maxZoom = MAX_ZOOM): Camera {
  if (content.width <= 0 || content.height <= 0 || view.width <= 0 || view.height <= 0) {
    return { zoom: 1, x: 0, y: 0 };
  }
  const availW = Math.max(1, view.width - padding * 2);
  const availH = Math.max(1, view.height - padding * 2);
  const zoom = clampZoom(
    Math.min(availW / content.width, availH / content.height),
    MIN_ZOOM,
    maxZoom,
  );
  return {
    zoom,
    x: (view.width - content.width * zoom) / 2,
    y: (view.height - content.height * zoom) / 2,
  };
}

/** Zooms to `zoom` while keeping the content point under `anchor` (screen space) fixed. */
export function zoomTo(camera: Camera, zoom: number, anchor: Point): Camera {
  const next = clampZoom(zoom);
  const contentX = (anchor.x - camera.x) / camera.zoom;
  const contentY = (anchor.y - camera.y) / camera.zoom;
  return { zoom: next, x: anchor.x - contentX * next, y: anchor.y - contentY * next };
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  const epsilon = 1e-4;
  if (direction > 0) return ZOOM_STOPS.find((z) => z > zoom + epsilon) ?? MAX_ZOOM;
  return [...ZOOM_STOPS].reverse().find((z) => z < zoom - epsilon) ?? MIN_ZOOM;
}

export function screenToContent(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function contentToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

/** A "nice" ruler step (1, 2, 5 × 10ⁿ content units) that is at least `minPx` apart on screen. */
export function rulerStep(zoom: number, minPx = 56): number {
  const raw = minPx / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    if (m * magnitude >= raw) return m * magnitude;
  }
  return 10 * magnitude;
}

export function formatZoom(zoom: number): string {
  const percent = zoom * 100;
  if (percent >= 10) return `${Math.round(percent)}%`;
  return `${percent.toFixed(1)}%`;
}
