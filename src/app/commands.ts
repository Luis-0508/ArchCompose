/**
 * Application-level commands: workflows that combine the platform (files), the
 * preview engine, the asset cache and the document store. UI components call
 * these instead of touching the platform directly.
 */
import { compositionSpec, describeExport, type ExportFormat } from "../engine/composition";
import { engineMimeFor, previewMimeFor, probeImage } from "../engine/preview";
import { addLayer, createComposeDoc } from "../model/compose";
import { addDrawing } from "../model/drawings";
import { addAsset, createProject, type NewAsset } from "../model/project";
import { parseProject, serializeProject } from "../model/serialization";
import type { AssetKind, AssetRef, ComposeDocId, DrawingId, DrawingKind } from "../model/types";
import { platform, type PickedFile } from "../platform";
import { assetCache } from "../state/assetCache";
import { selectComposeDoc, selectIsDirty, useAppStore } from "../state/store";

const store = () => useAppStore.getState();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function confirmDiscard(action: string): Promise<boolean> {
  if (!selectIsDirty(store())) return true;
  return store().requestConfirm({
    title: "Discard unsaved changes?",
    message: `The current project has changes that are not saved. ${action} will discard them.`,
    confirmLabel: "Discard changes",
  });
}

/**
 * Decodes files for preview and adds them to the project library in a single undo
 * step. Files that cannot be read are reported and skipped.
 */
export async function importFiles(files: PickedFile[], kind: AssetKind): Promise<AssetRef[]> {
  if (files.length === 0) return [];
  const prepared: { asset: NewAsset; url: string }[] = [];
  store().setBusy(
    files.length === 1 ? `Reading ${files[0]!.name}` : `Reading ${files.length} files`,
  );
  try {
    for (const file of files) {
      let url: string | null = null;
      try {
        // Engine-decoded files arrive as a PNG preview; the asset records the original type.
        const byEngine = file.decodedBy === "engine";
        const displayMime = byEngine ? "image/png" : previewMimeFor(file.name);
        const blob =
          file.blob.type === displayMime ? file.blob : new Blob([file.blob], { type: displayMime });
        url = URL.createObjectURL(blob);
        const size = await probeImage(url, file.name);
        prepared.push({
          url,
          asset: {
            name: file.name,
            kind,
            path: file.path,
            mime: byEngine ? engineMimeFor(file.name) : displayMime,
            byteSize: file.byteSize ?? blob.size,
            ...size,
          },
        });
      } catch (error) {
        if (url) URL.revokeObjectURL(url);
        store().notify("error", messageOf(error));
      }
    }
  } finally {
    store().setBusy(null);
  }
  if (prepared.length === 0) return [];

  const refs: AssetRef[] = [];
  store().apply(
    prepared.length === 1 ? "Import image" : `Import ${prepared.length} images`,
    (p) => {
      let next = p;
      for (const { asset } of prepared) {
        const [withAsset, ref] = addAsset(next, asset);
        next = withAsset;
        refs.push(ref);
      }
      return next;
    },
  );
  refs.forEach((ref, i) => assetCache.put(ref.id, prepared[i]!.url));
  return refs;
}

export async function pickAndImport(kind: AssetKind): Promise<AssetRef[]> {
  try {
    return await importFiles(await platform.pickImages(), kind);
  } catch (error) {
    store().notify("error", `Import failed. ${messageOf(error)}`);
    return [];
  }
}

/** Imports a render and opens it as a new compose document. */
export async function importRenderAsComposeDoc(files?: PickedFile[]): Promise<void> {
  const refs = files ? await importFiles(files, "render") : await pickAndImport("render");
  const base = refs[0];
  if (!base) return;
  createComposeFromAsset(base);
}

export function createComposeFromAsset(base: AssetRef): ComposeDocId {
  let docId = "";
  store().apply("New compose document", (p) => {
    const [next, doc] = createComposeDoc(p, base);
    docId = doc.id;
    return next;
  });
  store().select({ composeDocId: docId, layerId: null });
  store().setWorkspace("compose");
  return docId;
}

export function placeAssetInCompose(docId: ComposeDocId, asset: AssetRef): void {
  let layerId: string | null = null;
  store().apply("Place image", (p) => {
    const [next, id] = addLayer(p, docId, asset);
    layerId = id;
    return next;
  });
  if (layerId) store().select({ layerId });
}

export function createDrawingFromAsset(asset: AssetRef, kind: DrawingKind = "plan"): DrawingId {
  let drawingId = "";
  store().apply("New drawing", (p) => {
    const [next, drawing] = addDrawing(p, kind, {
      title: asset.name.replace(/\.[^.]+$/, ""),
      sourceAssetId: asset.id,
    });
    drawingId = drawing.id;
    return next;
  });
  store().select({ drawingId });
  return drawingId;
}

/**
 * Routes imported files by workspace: renders open a compose document (or become
 * layers in the open one), files dropped on Drawings become drawings, and Boards
 * collects them in the library for placement.
 */
export async function importIntoWorkspace(files: PickedFile[]): Promise<void> {
  const state = store();
  if (state.workspace === "compose") {
    const doc = selectComposeDoc(state);
    if (!doc) {
      await importRenderAsComposeDoc(files);
      return;
    }
    const refs = await importFiles(files, "cutout");
    for (const ref of refs) placeAssetInCompose(doc.id, ref);
    return;
  }
  if (state.workspace === "drawings") {
    const refs = await importFiles(files, "drawing");
    for (const ref of refs) createDrawingFromAsset(ref);
    return;
  }
  const refs = await importFiles(files, "image");
  if (refs.length > 0) {
    store().notify(
      "info",
      `Added ${refs.length === 1 ? "1 image" : `${refs.length} images`} to the library.`,
    );
  }
}

export async function pickIntoWorkspace(): Promise<void> {
  try {
    await importIntoWorkspace(await platform.pickImages());
  } catch (error) {
    store().notify("error", `Import failed. ${messageOf(error)}`);
  }
}

export async function handleDroppedFiles(files: PickedFile[]): Promise<void> {
  await importIntoWorkspace(files);
}

export async function newProject(): Promise<void> {
  if (!(await confirmDiscard("Creating a new project"))) return;
  assetCache.retain([]);
  store().replaceProject(createProject(), null, true);
}

export async function openProject(): Promise<void> {
  if (!(await confirmDiscard("Opening another project"))) return;
  let file;
  try {
    file = await platform.openProjectFile();
  } catch (error) {
    store().notify("error", `The project could not be opened. ${messageOf(error)}`);
    return;
  }
  if (!file) return;
  await loadProjectText(file.text, file.path ?? null);
}

/** Opens a project file by path without a dialog (desktop only). */
export async function loadProjectFromPath(path: string): Promise<void> {
  if (!(await confirmDiscard("Opening another project"))) return;
  try {
    await loadProjectText(await platform.readProjectFile(path), path);
  } catch (error) {
    store().notify("error", `The project could not be opened. ${messageOf(error)}`);
  }
}

async function loadProjectText(text: string, path: string | null): Promise<void> {
  let project;
  try {
    project = parseProject(text);
  } catch (error) {
    store().notify("error", messageOf(error));
    return;
  }
  const assets = project.assetOrder.map((id) => project.assets[id]!);
  assetCache.retain([]);
  store().replaceProject(project, path, true);
  store().setBusy("Loading project images");
  try {
    await assetCache.hydrate(assets);
  } finally {
    store().setBusy(null);
  }
  const missing = assets.filter((a) => !assetCache.isReady(a.id)).length;
  if (missing > 0) {
    store().notify(
      "error",
      `${missing} of ${assets.length} images could not be loaded. They are marked in the library.`,
    );
  } else {
    store().notify("success", `Opened “${project.name}”.`);
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const { history, filePath } = store();
  const project = history.present;
  try {
    const result = await platform.saveProjectFile(serializeProject(project), {
      suggestedName: project.name.replace(/[\\/:*?"<>|]/g, "-"),
      path: saveAs ? null : filePath,
    });
    if (!result) return false;
    store().markSaved(result.path ?? null);
    store().notify(
      "success",
      platform.kind === "desktop" ? "Project saved." : "Project file downloaded.",
    );
    return true;
  } catch (error) {
    store().notify("error", `The project was not saved. ${messageOf(error)}`);
    return false;
  }
}

/**
 * Renders a compose document with the image engine and saves it as PNG or layered
 * PSD. Exporting does not change the project, so it adds no undo step.
 */
export async function exportComposeDoc(docId: ComposeDocId, format: ExportFormat): Promise<void> {
  const engine = platform.engine;
  if (!engine) {
    store().notify(
      "error",
      "Exporting images needs the desktop app, which includes the image engine.",
    );
    return;
  }
  const project = store().history.present;
  const doc = project.composeDocs.find((d) => d.id === docId);
  if (!doc) return;
  const built = compositionSpec(project, doc, format);
  if (!built.ok) {
    store().notify("error", built.error);
    return;
  }
  try {
    const path = await engine.chooseExportTarget(format, doc.name.replace(/[\\/:*?"<>|]/g, "-"));
    if (!path) return;
    store().setBusy(format === "png" ? "Rendering image" : "Writing PSD");
    const report = await engine.exportComposition(built.spec, format, path);
    store().notify("success", describeExport(report, format));
  } catch (error) {
    store().notify("error", `The export failed. ${messageOf(error)}`);
  } finally {
    store().setBusy(null);
  }
}
