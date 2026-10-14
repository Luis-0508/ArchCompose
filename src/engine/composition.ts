/**
 * Translates a compose document into what the desktop image engine renders.
 *
 * The ArchCompose project stays the source of truth: the engine receives a snapshot of
 * one compose document (canvas size, layers bottom to top, the file each layer shows)
 * for a single render or export and keeps nothing. Undo therefore stays in the store.
 */
import { hasAdjustments } from "../model/compose";
import type { ComposeDoc, LayerAdjustments, Project } from "../model/types";

export type ExportFormat = "png" | "psd";

/** Mirrors `CompositionSpec` in `src-tauri/core/src/engine/composition.rs`. */
export interface CompositionSpec {
  name: string;
  width: number;
  height: number;
  layers: CompositionLayer[];
}

export interface CompositionLayer {
  name: string;
  path: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  visible: boolean;
  adjust?: LayerAdjustments;
}

/** Mirrors `ExportReport` in the backend. */
export interface ExportReport {
  width: number;
  height: number;
  bitDepth: number;
  layers: number;
  bytes: number;
}

export type CompositionResult = { ok: true; spec: CompositionSpec } | { ok: false; error: string };

/**
 * Builds the engine spec for a compose document. A flat PNG needs only visible layers;
 * a layered PSD keeps hidden ones. Every needed layer must refer to a file on disk.
 */
export function compositionSpec(
  project: Project,
  doc: ComposeDoc,
  format: ExportFormat,
): CompositionResult {
  const included = doc.layers.filter((l) => l.visible || format === "psd");
  if (!included.some((l) => l.visible)) {
    return { ok: false, error: "All layers are hidden. Show at least one layer to export." };
  }
  const layers: CompositionLayer[] = [];
  for (const layer of included) {
    const asset = project.assets[layer.assetId];
    if (!asset) {
      return {
        ok: false,
        error: `The image of layer “${layer.name}” is missing from the project.`,
      };
    }
    if (!asset.path) {
      return {
        ok: false,
        error: `“${asset.name}” was added in a browser session and has no file on disk. Import it again in the desktop app.`,
      };
    }
    layers.push({
      name: layer.name,
      path: asset.path,
      x: layer.x,
      y: layer.y,
      scale: layer.scale,
      opacity: layer.opacity,
      visible: layer.visible,
      ...(hasAdjustments(layer) ? { adjust: layer.adjust } : {}),
    });
  }
  return { ok: true, spec: { name: doc.name, width: doc.width, height: doc.height, layers } };
}

export function describeExport(report: ExportReport, format: ExportFormat): string {
  const kind = format === "png" ? "PNG" : "PSD";
  const layers =
    format === "psd" ? `, ${report.layers} ${report.layers === 1 ? "layer" : "layers"}` : "";
  return `Exported a ${report.width} × ${report.height} px ${report.bitDepth}-bit ${kind}${layers}.`;
}
