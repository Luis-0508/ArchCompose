import type { PointerEvent as ReactPointerEvent } from "react";
import { setHorizon, updateLayer } from "../../model/compose";
import type { ComposeDoc, ComposeLayer, Project } from "../../model/types";
import { useAdjustedPreview } from "../../state/adjustedPreviews";
import { useAssetSource } from "../../state/assetCache";
import { useAppStore } from "../../state/store";
import { contentToScreen, screenToContent, type Camera, type Point } from "../../viewport/camera";
import { trackDrag } from "../../viewport/trackDrag";
import { Viewport, type ViewportPointer } from "../../viewport/Viewport";
import styles from "./compose.module.css";

export const composeViewKey = (doc: ComposeDoc) => `compose:${doc.id}`;

function layerSize(project: Project, layer: ComposeLayer) {
  const asset = project.assets[layer.assetId];
  return {
    width: (asset?.width ?? 0) * layer.scale,
    height: (asset?.height ?? 0) * layer.scale,
  };
}

/** Topmost visible, unlocked layer under a document point. */
export function hitTest(project: Project, doc: ComposeDoc, point: Point): ComposeLayer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i]!;
    if (!layer.visible || layer.locked) continue;
    const { width, height } = layerSize(project, layer);
    if (
      point.x >= layer.x &&
      point.x <= layer.x + width &&
      point.y >= layer.y &&
      point.y <= layer.y + height
    ) {
      return layer;
    }
  }
  return null;
}

function LayerImage({ project, layer }: { project: Project; layer: ComposeLayer }) {
  const source = useAssetSource(layer.assetId);
  const asset = project.assets[layer.assetId];
  const adjusted = useAdjustedPreview(layer, asset);
  if (!asset || !layer.visible) return null;
  const style = {
    left: layer.x,
    top: layer.y,
    width: asset.width * layer.scale,
    height: asset.height * layer.scale,
    opacity: layer.opacity,
  };
  if (source?.status !== "ready") {
    return (
      <div className={styles.missingLayer} style={style}>
        <span>{source?.status === "loading" ? "Loading" : `Missing: ${asset.name}`}</span>
      </div>
    );
  }
  return (
    <img
      className={styles.layerImage}
      src={adjusted ?? source.url}
      style={style}
      alt=""
      draggable={false}
    />
  );
}

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

export function ComposeCanvas({ doc }: { doc: ComposeDoc }) {
  const project = useAppStore((s) => s.history.present);
  const tool = useAppStore((s) => s.composeTool);
  const layerId = useAppStore((s) => s.selection.layerId);
  const select = useAppStore((s) => s.select);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const viewKey = composeViewKey(doc);
  const selected = doc.layers.find((l) => l.id === layerId) ?? null;

  const startMove = (layer: ComposeLayer, pointer: ViewportPointer) => {
    const origin = { x: layer.x, y: layer.y };
    const zoom = pointer.camera.zoom;
    const startScreen = { x: pointer.event.clientX, y: pointer.event.clientY };
    let moved = false;
    trackDrag(
      pointer.event,
      (event) => {
        const dx = (event.clientX - startScreen.x) / zoom;
        const dy = (event.clientY - startScreen.y) / zoom;
        if (!moved && Math.hypot(dx * zoom, dy * zoom) < 2) return;
        if (!moved) {
          moved = true;
          beginGesture();
        }
        let x = origin.x + dx;
        let y = origin.y + dy;
        if (event.shiftKey) {
          // Constrain to the dominant axis.
          if (Math.abs(dx) > Math.abs(dy)) y = origin.y;
          else x = origin.x;
        }
        applyTransient((p) =>
          updateLayer(p, doc.id, layer.id, { x: Math.round(x), y: Math.round(y) }),
        );
      },
      () => moved && endGesture("Move layer"),
    );
  };

  const setHorizonAt = (pointer: ViewportPointer) => {
    const rect = (pointer.event.currentTarget as HTMLElement).getBoundingClientRect();
    beginGesture();
    applyTransient((p) => setHorizon(p, doc.id, pointer.content.y));
    trackDrag(
      pointer.event,
      (event) => {
        const local = screenToContent(pointer.camera, {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        applyTransient((p) => setHorizon(p, doc.id, local.y));
      },
      () => endGesture("Set horizon"),
    );
  };

  const onToolPointerDown = (pointer: ViewportPointer) => {
    if (tool === "horizon") {
      setHorizonAt(pointer);
      return;
    }
    const hit = hitTest(project, doc, pointer.content);
    select({ layerId: hit?.id ?? null });
    if (hit) startMove(hit, pointer);
  };

  const startScale = (corner: Corner, event: ReactPointerEvent, camera: Camera) => {
    if (!selected) return;
    event.stopPropagation();
    const { width, height } = layerSize(project, selected);
    const left = selected.x;
    const top = selected.y;
    const anchor = {
      x: corner.includes("w") ? left + width : left,
      y: corner.includes("n") ? top + height : top,
    };
    const stage = (event.currentTarget as HTMLElement).closest(
      "[data-testid^='viewport-']",
    ) as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const scale0 = selected.scale;
    beginGesture();
    trackDrag(
      event,
      (move) => {
        const p = screenToContent(camera, {
          x: move.clientX - rect.left,
          y: move.clientY - rect.top,
        });
        const ratio = Math.max(Math.abs(p.x - anchor.x) / width, Math.abs(p.y - anchor.y) / height);
        const scale = Math.max(0.01, scale0 * ratio);
        const w = (width / scale0) * scale;
        const h = (height / scale0) * scale;
        applyTransient((proj) =>
          updateLayer(proj, doc.id, selected.id, {
            scale,
            x: Math.round(corner.includes("w") ? anchor.x - w : anchor.x),
            y: Math.round(corner.includes("n") ? anchor.y - h : anchor.y),
          }),
        );
      },
      () => endGesture("Scale layer"),
    );
  };

  const overlay = (camera: Camera) => {
    const items = [];
    if (doc.horizonY !== null) {
      const a = contentToScreen(camera, { x: 0, y: doc.horizonY });
      const b = contentToScreen(camera, { x: doc.width, y: doc.horizonY });
      items.push(
        <div
          key="horizon"
          className={styles.horizon}
          style={{ left: a.x, top: a.y, width: b.x - a.x }}
        >
          <span className={`${styles.horizonLabel} num`}>Horizon {doc.horizonY} px</span>
        </div>,
      );
    }
    if (selected && selected.visible) {
      const { width, height } = layerSize(project, selected);
      const tl = contentToScreen(camera, { x: selected.x, y: selected.y });
      const box = {
        left: tl.x,
        top: tl.y,
        width: width * camera.zoom,
        height: height * camera.zoom,
      };
      items.push(
        <div key="selection" className={styles.selection} style={box} data-testid="layer-selection">
          {!selected.locked && tool === "select"
            ? CORNERS.map((corner) => (
                <span
                  key={corner}
                  className={`${styles.handle} ${styles[corner]}`}
                  onPointerDown={(e) => startScale(corner, e, camera)}
                  aria-hidden
                />
              ))
            : null}
        </div>,
      );
    }
    return items;
  };

  return (
    <Viewport
      viewKey={viewKey}
      content={{ width: doc.width, height: doc.height }}
      unit="px"
      label={`Compose view ${doc.name}`}
      mode={tool === "hand" ? "hand" : tool === "zoom" ? "zoom" : "tool"}
      cursor={tool === "horizon" ? "row-resize" : "default"}
      onToolPointerDown={onToolPointerDown}
      overlay={overlay}
    >
      <div className={styles.canvas} style={{ width: doc.width, height: doc.height }}>
        {doc.layers.map((layer) => (
          <LayerImage key={layer.id} project={project} layer={layer} />
        ))}
      </div>
    </Viewport>
  );
}
