import { createId } from "./ids";
import { replaceById } from "./project";
import type { AssetRef, ComposeDoc, ComposeDocId, ComposeLayer, LayerId, Project } from "./types";

export const MIN_LAYER_SCALE = 0.01;
export const MAX_LAYER_SCALE = 20;

/** Creates a compose document sized to a base render, which becomes the locked bottom layer. */
export function createComposeDoc(project: Project, base: AssetRef): [Project, ComposeDoc] {
  const doc: ComposeDoc = {
    id: createId("cmp"),
    name: stripExtension(base.name),
    width: base.width,
    height: base.height,
    layers: [
      {
        id: createId("lyr"),
        name: "Base render",
        assetId: base.id,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: true,
      },
    ],
    horizonY: null,
  };
  return [{ ...project, composeDocs: [...project.composeDocs, doc] }, doc];
}

export function updateComposeDoc(
  project: Project,
  docId: ComposeDocId,
  update: (doc: ComposeDoc) => ComposeDoc,
): Project {
  return { ...project, composeDocs: replaceById(project.composeDocs, docId, update) };
}

export function renameComposeDoc(project: Project, docId: ComposeDocId, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) return project;
  return updateComposeDoc(project, docId, (d) => ({ ...d, name: trimmed }));
}

export function removeComposeDoc(project: Project, docId: ComposeDocId): Project {
  return { ...project, composeDocs: project.composeDocs.filter((d) => d.id !== docId) };
}

/**
 * Places an asset as a new layer on top of the stack. The layer is scaled so its
 * height is at most a quarter of the canvas and centred, a sensible starting point
 * for people and vegetation cut-outs.
 */
export function addLayer(
  project: Project,
  docId: ComposeDocId,
  asset: AssetRef,
): [Project, LayerId | null] {
  const doc = project.composeDocs.find((d) => d.id === docId);
  if (!doc) return [project, null];
  const scale = clampScale(Math.min(1, (doc.height * 0.25) / Math.max(1, asset.height)));
  const layer: ComposeLayer = {
    id: createId("lyr"),
    name: stripExtension(asset.name),
    assetId: asset.id,
    x: Math.round((doc.width - asset.width * scale) / 2),
    y: Math.round((doc.height - asset.height * scale) / 2),
    scale,
    opacity: 1,
    visible: true,
    locked: false,
  };
  return [
    updateComposeDoc(project, docId, (d) => ({ ...d, layers: [...d.layers, layer] })),
    layer.id,
  ];
}

export type LayerPatch = Partial<Omit<ComposeLayer, "id" | "assetId">>;

export function updateLayer(
  project: Project,
  docId: ComposeDocId,
  layerId: LayerId,
  patch: LayerPatch,
): Project {
  const normalized: LayerPatch = { ...patch };
  if (normalized.scale !== undefined) normalized.scale = clampScale(normalized.scale);
  if (normalized.opacity !== undefined) {
    normalized.opacity = Math.min(1, Math.max(0, normalized.opacity));
  }
  if (normalized.name !== undefined && !normalized.name.trim()) delete normalized.name;
  return updateComposeDoc(project, docId, (d) => ({
    ...d,
    layers: replaceById(d.layers, layerId, (l) => ({ ...l, ...normalized })),
  }));
}

export function removeLayer(project: Project, docId: ComposeDocId, layerId: LayerId): Project {
  return updateComposeDoc(project, docId, (d) => ({
    ...d,
    layers: d.layers.filter((l) => l.id !== layerId),
  }));
}

/** Moves a layer one step up (towards the viewer, +1) or down (-1) in the stack. */
export function reorderLayer(
  project: Project,
  docId: ComposeDocId,
  layerId: LayerId,
  direction: 1 | -1,
): Project {
  return updateComposeDoc(project, docId, (d) => {
    const index = d.layers.findIndex((l) => l.id === layerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= d.layers.length) return d;
    const layers = [...d.layers];
    const [moved] = layers.splice(index, 1);
    layers.splice(target, 0, moved!);
    return { ...d, layers };
  });
}

export function setHorizon(project: Project, docId: ComposeDocId, y: number | null): Project {
  return updateComposeDoc(project, docId, (d) => ({
    ...d,
    horizonY: y === null ? null : Math.round(Math.min(d.height, Math.max(0, y))),
  }));
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_LAYER_SCALE, Math.max(MIN_LAYER_SCALE, scale));
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
