import { defaultSheet, fitUnderlay, sheetForImage } from "./sheet";
import type { AssetRef } from "./types";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Version 2 adds vibrance, warmth, blur and sharpening to layer adjustments. */
function migrateAdjustments(docs: unknown): unknown {
  if (!Array.isArray(docs)) return docs;
  return docs.map((doc: unknown) => {
    if (!isObject(doc) || !Array.isArray(doc.layers)) return doc;
    return {
      ...doc,
      layers: doc.layers.map((layer: unknown) =>
        isObject(layer) && isObject(layer.adjust)
          ? { ...layer, adjust: { vibrance: 0, warmth: 0, blur: 0, sharpen: 0, ...layer.adjust } }
          : layer,
      ),
    };
  });
}

/**
 * Version 1 drawings referenced an image file (`sourceAssetId`) without a sheet. Version 2
 * gives every drawing a paper sheet and editable elements. A drawing with a file gets an
 * A1 sheet matching the image's orientation, with the image fitted as an underlay.
 */
function migrateV1toV2(data: Json): Json {
  const assets = isObject(data.assets) ? data.assets : {};
  const drawings = Array.isArray(data.drawings) ? data.drawings : [];
  return {
    ...data,
    schemaVersion: 2,
    composeDocs: migrateAdjustments(data.composeDocs),
    drawings: drawings.map((drawing: unknown) => {
      if (!isObject(drawing)) return drawing;
      const { sourceAssetId, ...rest } = drawing;
      const asset =
        typeof sourceAssetId === "string" && isObject(assets[sourceAssetId])
          ? (assets[sourceAssetId] as unknown as AssetRef)
          : null;
      const usable =
        asset &&
        typeof asset.width === "number" &&
        typeof asset.height === "number" &&
        asset.width > 0 &&
        asset.height > 0;
      if (!usable) return { ...rest, sheet: defaultSheet(), underlay: null, elements: [] };
      const format = sheetForImage(asset);
      return {
        ...rest,
        sheet: defaultSheet(format),
        underlay: fitUnderlay(format, asset),
        elements: [],
      };
    }),
  };
}

const MIGRATIONS: Record<number, (data: Json) => Json> = {
  1: migrateV1toV2,
};

/** Upgrades parsed project data step by step to the current schema version. */
export function migrateProjectData(data: Json, target: number): Json {
  let current = data;
  while (typeof current.schemaVersion === "number" && current.schemaVersion < target) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) break;
    current = step(current);
  }
  return current;
}
