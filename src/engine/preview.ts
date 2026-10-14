/**
 * Preview image handling backed by the system web view.
 *
 * This is deliberately not an image engine: it only decodes files the web view
 * can already display and reads their pixel size. Pixel editing, export and PSD
 * belong to a future engine adapter (see docs/ARCHITECTURE.md, "Engine boundary").
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

/** Formats an architect is likely to try that the preview renderer cannot read. */
const ENGINE_ONLY_EXTENSIONS = new Set(["psd", "psb", "tif", "tiff", "exr", "hdr", "pdf", "dwg"]);

export const PREVIEW_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);

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
  if (ENGINE_ONLY_EXTENSIONS.has(ext)) {
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
