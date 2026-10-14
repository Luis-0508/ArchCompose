import { createId } from "./ids";
import { PROJECT_SCHEMA_VERSION, type AssetId, type AssetRef, type Project } from "./types";

export function createProject(name = "Untitled project", now = new Date()): Project {
  const stamp = now.toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId("prj"),
    name,
    createdAt: stamp,
    modifiedAt: stamp,
    assets: {},
    assetOrder: [],
    composeDocs: [],
    drawings: [],
    boards: [],
  };
}

export function renameProject(project: Project, name: string): Project {
  const trimmed = name.trim();
  return trimmed ? { ...project, name: trimmed } : project;
}

export type NewAsset = Omit<AssetRef, "id" | "addedAt">;

export function addAsset(project: Project, asset: NewAsset, now = new Date()): [Project, AssetRef] {
  const ref: AssetRef = { ...asset, id: createId("ast"), addedAt: now.toISOString() };
  return [
    {
      ...project,
      assets: { ...project.assets, [ref.id]: ref },
      assetOrder: [...project.assetOrder, ref.id],
    },
    ref,
  ];
}

export function updateAsset(
  project: Project,
  id: AssetId,
  patch: Partial<Pick<AssetRef, "name" | "kind">>,
): Project {
  const asset = project.assets[id];
  if (!asset) return project;
  return { ...project, assets: { ...project.assets, [id]: { ...asset, ...patch } } };
}

/** Counts every place an asset is referenced, so the UI can warn before removal. */
export function assetUsage(project: Project, id: AssetId): number {
  let count = 0;
  for (const doc of project.composeDocs) count += doc.layers.filter((l) => l.assetId === id).length;
  count += project.drawings.filter((d) => d.sourceAssetId === id).length;
  for (const board of project.boards) {
    count += board.frames.filter(
      (f) => f.content.type === "asset" && f.content.assetId === id,
    ).length;
  }
  return count;
}

/** Removes an asset and every reference to it. Board frames fall back to empty. */
export function removeAsset(project: Project, id: AssetId): Project {
  if (!project.assets[id]) return project;
  const assets = { ...project.assets };
  delete assets[id];
  return {
    ...project,
    assets,
    assetOrder: project.assetOrder.filter((a) => a !== id),
    composeDocs: project.composeDocs.map((doc) => ({
      ...doc,
      layers: doc.layers.filter((l) => l.assetId !== id),
    })),
    drawings: project.drawings.map((d) =>
      d.sourceAssetId === id ? { ...d, sourceAssetId: null } : d,
    ),
    boards: project.boards.map((b) => ({
      ...b,
      frames: b.frames.map((f) =>
        f.content.type === "asset" && f.content.assetId === id
          ? { ...f, content: { type: "empty" as const } }
          : f,
      ),
    })),
  };
}

export function replaceById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  update: (item: T) => T,
): T[] {
  return items.map((item) => (item.id === id ? update(item) : item));
}
