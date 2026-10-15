/**
 * The single list of user-facing capabilities and whether they work today.
 *
 * UI code asks this registry instead of hard-coding "coming soon" labels, so the
 * state of every planned feature is visible and changeable in one place. When an
 * engine (for example PhotoCraft, see docs/UPSTREAM.md) starts providing a
 * capability, its status changes here and nowhere else.
 */
export type CapabilityStatus = "available" | "planned";

/** Who provides, or is expected to provide, the capability. */
export type CapabilityProvider = "archcompose" | "preview" | "engine";

export interface Capability {
  label: string;
  status: CapabilityStatus;
  provider: CapabilityProvider;
  /** One sentence for tooltips: what it does, or why it is not available yet. */
  note: string;
  /** Set when the capability needs the desktop app's image engine. */
  desktopOnly?: true;
}

export const CAPABILITIES = {
  "image.import": {
    label: "Import images",
    status: "available",
    provider: "preview",
    note: "PNG, JPEG, WebP, AVIF, GIF, BMP and SVG are decoded by the system web view for preview.",
  },
  "image.engineFormats": {
    label: "Import TIFF, PSD and OpenEXR",
    status: "available",
    provider: "engine",
    desktopOnly: true,
    note: "TIFF, PSD, PSB, OpenEXR, Radiance HDR, TGA and QOI are read by the image engine and converted to sRGB. HDR values above white are clipped.",
  },
  "compose.arrange": {
    label: "Place and arrange layers",
    status: "available",
    provider: "archcompose",
    note: "Move, scale, reorder, hide and fade placed images. The canvas is a web view preview; exports are rendered by the image engine.",
  },
  "compose.horizon": {
    label: "Horizon guide",
    status: "available",
    provider: "archcompose",
    note: "A manual guide line for judging eye level. It does not calibrate perspective.",
  },
  "compose.perspective": {
    label: "Perspective calibration",
    status: "planned",
    provider: "archcompose",
    note: "Ground plane and vanishing point calibration for scale-aware placement.",
  },
  "compose.mask": {
    label: "Masks",
    status: "planned",
    provider: "engine",
    note: "Raster and vector masks need the image engine.",
  },
  "compose.shadow": {
    label: "Contact shadows",
    status: "planned",
    provider: "engine",
    note: "Contact and directional shadows need the image engine and a calibrated ground plane.",
  },
  "compose.segment": {
    label: "Segmentation",
    status: "planned",
    provider: "engine",
    note: "Automatic selection of sky, glazing and vegetation is not available.",
  },
  "compose.adjust": {
    label: "Adjustments",
    status: "available",
    provider: "engine",
    desktopOnly: true,
    note: "Exposure, brightness, contrast, saturation, vibrance and warmth per layer, applied non-destructively by the image engine in the canvas and in exports.",
  },
  "compose.filters": {
    label: "Blur and sharpen",
    status: "available",
    provider: "engine",
    desktopOnly: true,
    note: "Gaussian blur and unsharp-mask sharpening per layer, from the image engine's filters, in the canvas and in exports.",
  },
  "compose.export": {
    label: "Export image",
    status: "available",
    provider: "engine",
    desktopOnly: true,
    note: "Renders the view at full resolution with the image engine and saves a PNG with transparency, 16-bit when a source is 16-bit.",
  },
  "file.psd": {
    label: "PSD import and export",
    status: "available",
    provider: "engine",
    desktopOnly: true,
    note: "Opens the composite image of PSD and PSB files and exports views as layered PSD. Layers inside an imported PSD are not separated.",
  },
  "drawings.sheet": {
    label: "Drawing sheets",
    status: "available",
    provider: "archcompose",
    note: "Blank or annotated sheets in A0 to A4 or a custom size, with grid, snapping, rulers, scale and editable pen, line, shape and text content.",
  },
  "drawings.export": {
    label: "Export drawing sheets",
    status: "planned",
    provider: "engine",
    note: "Rendering sheets to PNG or PDF at a chosen resolution with the image engine's vector renderer is planned. Text needs the engine's font handling first.",
  },
  "compose.brush": {
    label: "Brush and eraser on images",
    status: "planned",
    provider: "engine",
    note: "Painting and erasing image layers with the image engine's brush engine is planned.",
  },
  "drawings.pdf": {
    label: "PDF and vector drawings",
    status: "planned",
    provider: "archcompose",
    note: "Drawings are previewed as raster or SVG images. PDF import is planned.",
  },
  "drawings.compare": {
    label: "Compare revisions",
    status: "planned",
    provider: "archcompose",
    note: "Overlaying two revisions of a drawing is planned.",
  },
  "boards.scaledPlacement": {
    label: "Place drawings at scale",
    status: "planned",
    provider: "archcompose",
    note: "Drawings are fitted to their frame. True-scale placement needs calibrated drawings.",
  },
  "boards.pdf": {
    label: "Export print PDF",
    status: "planned",
    provider: "archcompose",
    note: "Print-ready PDF export is planned. The submission check already works.",
  },
} as const satisfies Record<string, Capability>;

export type CapabilityId = keyof typeof CAPABILITIES;

export function capability(id: CapabilityId): Capability {
  return CAPABILITIES[id];
}

export function isAvailable(id: CapabilityId): boolean {
  return CAPABILITIES[id].status === "available";
}

/** Whether a capability works in this build: desktop-only ones need the image engine. */
export function isAvailableIn(id: CapabilityId, host: { engine: unknown }): boolean {
  const cap: Capability = CAPABILITIES[id];
  return cap.status === "available" && (!cap.desktopOnly || host.engine !== null);
}
