import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ExportFormat, ExportReport } from "../engine/composition";
import {
  ENGINE_EXTENSIONS,
  isEngineFormat,
  PREVIEW_EXTENSIONS,
  previewMimeFor,
} from "../engine/preview";
import { PROJECT_FILE_EXTENSION } from "../model/serialization";
import { PlatformError, type EngineStatus, type PickedFile, type Platform } from "./types";

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Rust commands return plain strings as errors; wrap them so callers can show them. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new PlatformError(typeof error === "string" ? error : String(error));
  }
}

/** Reads a file for display. Formats the web view cannot show are decoded by the engine. */
async function readBlob(path: string, name: string): Promise<Blob> {
  if (isEngineFormat(name)) {
    const png = await call<ArrayBuffer>("engine_decode_preview", { path });
    return new Blob([png], { type: "image/png" });
  }
  const mime = previewMimeFor(name);
  const bytes = await call<ArrayBuffer>("read_file", { path });
  return new Blob([bytes], { type: mime });
}

async function readPaths(paths: string[]): Promise<PickedFile[]> {
  return Promise.all(
    paths.map(async (path): Promise<PickedFile> => {
      const name = baseName(path);
      const blob = await readBlob(path, name);
      if (!isEngineFormat(name)) return { name, path, blob };
      const byteSize = await call<number>("file_size", { path });
      return { name, path, blob, decodedBy: "engine", byteSize };
    }),
  );
}

const EXPORT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  png: { name: "PNG image", extensions: ["png"] },
  psd: { name: "Photoshop document", extensions: ["psd"] },
};

export const desktopPlatform: Platform = {
  kind: "desktop",

  async pickImages() {
    const selection = await open({
      multiple: true,
      directory: false,
      title: "Import images",
      filters: [{ name: "Images", extensions: [...PREVIEW_EXTENSIONS, ...ENGINE_EXTENSIONS] }],
    });
    if (!selection) return [];
    return readPaths(Array.isArray(selection) ? selection : [selection]);
  },

  async openProjectFile() {
    const path = await open({
      multiple: false,
      directory: false,
      title: "Open project",
      filters: [{ name: "ArchCompose project", extensions: [PROJECT_FILE_EXTENSION] }],
    });
    if (typeof path !== "string") return null;
    const text = await call<string>("read_project_file", { path });
    return { name: baseName(path), path, text };
  },

  async saveProjectFile(text, { suggestedName, path }) {
    let target = path ?? null;
    if (!target) {
      target = await save({
        title: "Save project",
        defaultPath: `${suggestedName}.${PROJECT_FILE_EXTENSION}`,
        filters: [{ name: "ArchCompose project", extensions: [PROJECT_FILE_EXTENSION] }],
      });
    }
    if (!target) return null;
    await call<void>("write_project_file", { path: target, contents: text });
    return { path: target };
  },

  readProjectFile(path) {
    return call<string>("read_project_file", { path });
  },

  readFile: readBlob,

  onFileDrop(handler) {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop" || event.payload.paths.length === 0) return;
        readPaths(event.payload.paths).then(handler, (error: unknown) => {
          console.error("Dropped files could not be read", error);
        });
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  },

  engineStatus() {
    return call<EngineStatus>("engine_status");
  },

  engine: {
    formats: ENGINE_EXTENSIONS,

    async layerPreview(path, adjust, layerScale) {
      const png = await call<ArrayBuffer>("engine_layer_preview", { path, adjust, layerScale });
      return new Blob([png], { type: "image/png" });
    },

    async chooseExportTarget(format, suggestedName) {
      const filter = EXPORT_FILTERS[format];
      return save({
        title: format === "png" ? "Export image" : "Export PSD",
        defaultPath: `${suggestedName}.${format}`,
        filters: [filter],
      });
    },

    exportComposition(spec, format, path) {
      return call<ExportReport>(`engine_export_${format}`, { spec, path });
    },
  },
};
