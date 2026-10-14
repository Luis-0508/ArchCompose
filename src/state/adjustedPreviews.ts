import { useEffect, useState } from "react";
import { hasAdjustments } from "../model/compose";
import type { AssetRef, ComposeLayer } from "../model/types";
import { platform } from "../platform";

/**
 * Engine-rendered previews of adjusted layers. The canvas shows these instead of the
 * original image so that what the user sees uses the same adjustment code as the export.
 * Previews are runtime data, like the asset cache; nothing here enters the project.
 */
const MAX_CACHED = 24;
const DEBOUNCE_MS = 120;
const cache = new Map<string, string>();

function remember(key: string, url: string) {
  cache.set(key, url);
  while (cache.size > MAX_CACHED) {
    const [oldest, oldUrl] = cache.entries().next().value!;
    cache.delete(oldest);
    URL.revokeObjectURL(oldUrl);
  }
}

/**
 * The preview URL for an adjusted layer, or null when the layer has no adjustments, no
 * engine is available, or the first preview is still being rendered. While a new preview
 * renders, the previous one stays on screen.
 */
export function useAdjustedPreview(
  layer: ComposeLayer,
  asset: AssetRef | undefined,
): string | null {
  const engine = platform.engine;
  const path = asset?.path;
  const wanted = engine && path && hasAdjustments(layer) ? layer.adjust! : null;
  // Filter radii are in document pixels, so the preview depends on the layer's scale.
  const scale = wanted && (wanted.blur > 0 || wanted.sharpen > 0) ? layer.scale : 1;
  const key = wanted
    ? `${path}
${JSON.stringify(wanted)}
${scale}`
    : null;
  // The latest rendered preview of this layer, shown while the next one renders.
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !wanted || !engine || !path || cache.has(key)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      engine.layerPreview(path, wanted, scale).then(
        (blob) => {
          const url = URL.createObjectURL(blob);
          remember(key, url);
          if (!cancelled) setLatest(url);
        },
        (error: unknown) => console.error("The adjusted preview could not be rendered", error),
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `wanted` and `scale` are captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, engine, path]);

  if (!key) return null;
  const hit = cache.get(key);
  if (hit) return hit;
  // A URL evicted from the cache has been revoked; fall back to the original image.
  return latest && [...cache.values()].includes(latest) ? latest : null;
}
