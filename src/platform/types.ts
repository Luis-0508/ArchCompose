/**
 * Everything the app needs from the host environment. The desktop build talks to
 * the Rust backend through Tauri; the browser build (used for development and
 * end-to-end tests) falls back to web APIs where they exist.
 */
export interface PickedFile {
  name: string;
  /** Absolute path, available on desktop only. */
  path?: string;
  blob: Blob;
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
}

export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}
