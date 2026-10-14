import { PREVIEW_EXTENSIONS } from "../engine/preview";
import { PROJECT_FILE_EXTENSION } from "../model/serialization";
import { PlatformError, type PickedFile, type Platform } from "./types";

/** Opens the browser's file chooser. Resolves with an empty list when cancelled. */
function chooseFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    input.dataset.testid = "file-input";
    input.addEventListener("change", () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve([]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

function toPicked(files: File[]): PickedFile[] {
  return files.map((file) => ({ name: file.name, blob: file }));
}

/**
 * Browser fallback used by `npm run dev` and the end-to-end tests. Files have no
 * stable path here, so assets cannot be reloaded after a project is reopened.
 */
export const browserPlatform: Platform = {
  kind: "browser",

  async pickImages() {
    const accept = PREVIEW_EXTENSIONS.map((e) => `.${e}`).join(",");
    return toPicked(await chooseFiles(accept, true));
  },

  async openProjectFile() {
    const [file] = await chooseFiles(`.${PROJECT_FILE_EXTENSION},application/json`, false);
    if (!file) return null;
    return { name: file.name, text: await file.text() };
  },

  async saveProjectFile(text, { suggestedName }) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${suggestedName}.${PROJECT_FILE_EXTENSION}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return {};
  },

  async readProjectFile() {
    throw new PlatformError("Opening projects by path needs the desktop app.");
  },

  async readFile(_path, name) {
    throw new PlatformError(
      `“${name}” was added in a browser session and cannot be reloaded. Import it again.`,
    );
  },

  onFileDrop(handler) {
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      handler(toPicked(files));
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  },

  async engineStatus() {
    return { renderer: "Browser preview", engineLinked: false, appVersion: __APP_VERSION__ };
  },
};
