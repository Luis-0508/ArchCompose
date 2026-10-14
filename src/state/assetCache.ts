import { useSyncExternalStore } from "react";
import type { AssetId, AssetRef } from "../model/types";
import { platform } from "../platform";

/**
 * Runtime pixel sources for project assets. The project file only stores
 * references; this cache owns the object URLs that the preview renderer displays
 * and releases them when assets leave the project.
 */
export type AssetSource =
  { status: "loading" } | { status: "ready"; url: string } | { status: "missing"; reason: string };

const sources = new Map<AssetId, AssetSource>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  for (const listener of listeners) listener();
}

function set(id: AssetId, source: AssetSource) {
  const previous = sources.get(id);
  if (previous?.status === "ready" && (source.status !== "ready" || source.url !== previous.url)) {
    URL.revokeObjectURL(previous.url);
  }
  sources.set(id, source);
  emit();
}

export const assetCache = {
  get(id: AssetId): AssetSource | undefined {
    return sources.get(id);
  },

  isReady(id: AssetId): boolean {
    return sources.get(id)?.status === "ready";
  },

  /** Registers pixels that were just imported. */
  put(id: AssetId, url: string) {
    set(id, { status: "ready", url });
  },

  /** Loads pixels for assets of an opened project from their recorded paths. */
  async hydrate(assets: AssetRef[]) {
    await Promise.all(
      assets.map(async (asset) => {
        if (!asset.path) {
          set(asset.id, {
            status: "missing",
            reason: "Added in a browser session without a file path. Import it again.",
          });
          return;
        }
        set(asset.id, { status: "loading" });
        try {
          const blob = await platform.readFile(asset.path, asset.name);
          set(asset.id, { status: "ready", url: URL.createObjectURL(blob) });
        } catch (error) {
          set(asset.id, {
            status: "missing",
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  },

  /** Drops every cached source that is not part of `keep`. */
  retain(keep: Iterable<AssetId>) {
    const keepSet = new Set(keep);
    let changed = false;
    for (const [id, source] of sources) {
      if (keepSet.has(id)) continue;
      if (source.status === "ready") URL.revokeObjectURL(source.url);
      sources.delete(id);
      changed = true;
    }
    if (changed) emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Re-renders when any asset source changes. */
export function useAssetCacheVersion(): number {
  return useSyncExternalStore(assetCache.subscribe, () => version);
}

export function useAssetSource(id: AssetId | null | undefined): AssetSource | undefined {
  useAssetCacheVersion();
  return id ? assetCache.get(id) : undefined;
}
