import type { CompositionSpec, ExportFormat, ExportReport } from "../engine/composition";

/**
 * Everything the app needs from the host environment. The desktop build talks to
 * the Rust backend through Tauri; the browser build (used for development and
 * end-to-end tests) falls back to web APIs where they exist.
 */
export interface PickedFile {
  name: string;
  /** Absolute path, available on desktop only. */
  path?: string;
  /** Pixels the web view can display: the file itself, or an engine-made PNG of it. */
  blob: Blob;
  /** Set when `blob` is a PNG the image engine decoded from the file. */
  decodedBy?: "engine";
  /** Size of the original file when `blob` is not the file itself. */
  byteSize?: number;
}

export interface OpenedProjectFile {
  name: string;
  path?: string;
  text: string;
}

export interface EngineStatus {
  /** Name of the renderer that produces what the user sees. */
  renderer: string;
  /** Whether an image engine (such as PhotoCraft) is linked into this build. */
  engineLinked: boolean;
  appVersion: string;
  /** Version and commit of the linked engine, for the third-party notices. */
  engineVersion?: string;
  engineRevision?: string;
}

/** Image work done by the desktop image engine. */
export interface ImageEngine {
  /** File extensions the engine decodes in addition to the web view's formats. */
  formats: readonly string[];
  /** Asks where to save an export. Returns null when the user cancels. */
  chooseExportTarget(format: ExportFormat, suggestedName: string): Promise<string | null>;
  /** Renders the composition at full resolution and writes it to `path`. */
  exportComposition(
    spec: CompositionSpec,
    format: ExportFormat,
    path: string,
  ): Promise<ExportReport>;
}

export interface Platform {
  kind: "desktop" | "browser";
  pickImages(): Promise<PickedFile[]>;
  openProjectFile(): Promise<OpenedProjectFile | null>;
  /**
   * Writes a project file. Passing `path` overwrites that file; otherwise the user
   * chooses a location. Returns null when the user cancels.
   */
  saveProjectFile(
    text: string,
    options: { suggestedName: string; path?: string | null },
  ): Promise<{ path?: string } | null>;
  /** Reads a project file by path, e.g. from a recent-projects list (desktop only). */
  readProjectFile(path: string): Promise<string>;
  /** Reads a previously imported file again, e.g. after reopening a project. */
  readFile(path: string, name: string): Promise<Blob>;
  /** Subscribes to files dropped onto the window. Returns an unsubscribe function. */
  onFileDrop(handler: (files: PickedFile[]) => void): () => void;
  engineStatus(): Promise<EngineStatus>;
  /** The image engine, or null where none is linked (the browser build). */
  engine: ImageEngine | null;
}

export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}
