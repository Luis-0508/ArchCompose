/**
 * Preview image handling backed by the system web view.
 *
 * The web view decodes the formats it can display and reads their pixel size. The
 * desktop app's image engine reads further formats (TIFF, PSD, OpenEXR, …) and hands
 * the web view a PNG of them; see docs/ARCHITECTURE.md, "Engine boundary".
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

/** Formats the desktop image engine reads, with the MIME type of the original file. */
const ENGINE_MIME_BY_EXTENSION: Record<string, string> = {
  tif: "image/tiff",
  tiff: "image/tiff",
  psd: "image/vnd.adobe.photoshop",
  psb: "image/vnd.adobe.photoshop",
  exr: "image/x-exr",
  hdr: "image/vnd.radiance",
  tga: "image/x-tga",
  qoi: "image/qoi",
};

/** Formats an architect is likely to try that neither the web view nor the engine reads. */
const UNSUPPORTED_EXTENSIONS = new Set(["pdf", "dwg"]);

export const PREVIEW_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);
export const ENGINE_EXTENSIONS = Object.keys(ENGINE_MIME_BY_EXTENSION);

/** Whether the desktop image engine, not the web view, decodes this file. */
export function isEngineFormat(name: string): boolean {
  return Object.hasOwn(ENGINE_MIME_BY_EXTENSION, extensionOf(name));
}

/** MIME type of an engine-decoded file as recorded in the project. */
export function engineMimeFor(name: string): string {
  const ext = extensionOf(name);
  return Object.hasOwn(ENGINE_MIME_BY_EXTENSION, ext)
    ? ENGINE_MIME_BY_EXTENSION[ext]!
    : "application/octet-stream";
}

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Returns the MIME type for a previewable file, or throws a message the user can act on. */
export function previewMimeFor(name: string): string {
  const ext = extensionOf(name);
  const mime = MIME_BY_EXTENSION[ext];
  if (mime) return mime;
  if (Object.hasOwn(ENGINE_MIME_BY_EXTENSION, ext)) {
    throw new UnsupportedImageError(
      `${ext.toUpperCase()} files need the desktop app, which reads them with its image engine. Export the file as PNG or JPEG to use it here.`,
    );
  }
  if (UNSUPPORTED_EXTENSIONS.has(ext)) {
    throw new UnsupportedImageError(
      `${ext.toUpperCase()} files are not supported yet. Export the file as PNG or JPEG to use it now.`,
    );
  }
  throw new UnsupportedImageError(
    `“${name}” is not a supported image. Use ${PREVIEW_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}.`,
  );
}

/** Decodes an image and returns its pixel size. Throws when the data cannot be decoded. */
export async function probeImage(
  url: string,
  name: string,
): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new UnsupportedImageError(`“${name}” could not be decoded. The file may be damaged.`);
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new UnsupportedImageError(
      `“${name}” has no fixed pixel size. SVG files need width and height attributes.`,
    );
  }
  return { width: image.naturalWidth, height: image.naturalHeight };
}
