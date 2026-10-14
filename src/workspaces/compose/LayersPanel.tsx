import { removeLayer, reorderLayer, updateLayer } from "../../model/compose";
import type { ComposeDoc } from "../../model/types";
import { useAppStore } from "../../state/store";
import { Button, IconButton } from "../../ui/Button";
import { EmptyState } from "../../ui/Panel";
import { AssetThumb } from "../shared/AssetLibrary";
import styles from "../workspace.module.css";
import local from "./compose.module.css";

/** Layer stack, top layer first, as in most editors. */
export function LayersPanel({
  doc,
  onOpenLibrary,
}: {
  doc: ComposeDoc | null;
  onOpenLibrary: () => void;
}) {
  const assets = useAppStore((s) => s.history.present.assets);
  const layerId = useAppStore((s) => s.selection.layerId);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);

  if (!doc) {
    return (
      <EmptyState compact icon="layers" title="No view open">
        <p>Layers appear here once a render is imported.</p>
      </EmptyState>
    );
  }

  const stack = [...doc.layers].reverse();
  const selectedLocked = doc.layers.find((l) => l.id === layerId)?.locked ?? false;
  return (
    <div className={local.layers}>
      <ul className={local.layerList} role="listbox" aria-label="Layers">
        {stack.map((layer, index) => {
          const asset = assets[layer.assetId];
          const isTop = index === 0;
          const isBottom = index === stack.length - 1;
          return (
            <li
              key={layer.id}
              role="option"
              aria-selected={layer.id === layerId}
              className={`${styles.row} ${local.layerRow} ${layer.visible ? "" : local.hidden}`}
              tabIndex={layer.id === layerId || (!layerId && isTop) ? 0 : -1}
              onClick={() => select({ layerId: layer.id })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select({ layerId: layer.id });
                }
              }}
            >
              {asset ? <AssetThumb asset={asset} /> : null}
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{layer.name}</span>
                <span className={`${styles.rowMeta} num`}>
                  Scale {Math.round(layer.scale * 100)}%
                  {layer.opacity < 1 ? `, ${Math.round(layer.opacity * 100)}% opacity` : ""}
                  {layer.locked ? ", locked" : ""}
                </span>
              </span>
              <span className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                <IconButton
                  size="sm"
                  icon={layer.locked ? "lock" : "unlock"}
                  label={layer.locked ? "Unlock layer" : "Lock layer"}
                  pressed={layer.locked}
                  tooltipPlacement="left"
                  onClick={() =>
                    apply(layer.locked ? "Unlock layer" : "Lock layer", (p) =>
                      updateLayer(p, doc.id, layer.id, { locked: !layer.locked }),
                    )
                  }
                />
                <IconButton
                  size="sm"
                  icon={layer.visible ? "eye" : "eyeOff"}
                  label={layer.visible ? "Hide layer" : "Show layer"}
                  tooltipPlacement="left"
                  onClick={() =>
                    apply(layer.visible ? "Hide layer" : "Show layer", (p) =>
                      updateLayer(p, doc.id, layer.id, { visible: !layer.visible }),
                    )
                  }
                />
              </span>
              <span className="visually-hidden">
                {isTop ? "Top layer" : isBottom ? "Bottom layer" : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={local.layerFooter}>
        <Button size="sm" variant="ghost" icon="plus" onClick={onOpenLibrary}>
          Place from library
        </Button>
        <span className={styles.contextSpacer} />
        <IconButton
          size="sm"
          icon="up"
          label="Move layer up"
          disabled={!layerId || doc.layers.at(-1)?.id === layerId}
          onClick={() =>
            layerId && apply("Move layer up", (p) => reorderLayer(p, doc.id, layerId, 1))
          }
        />
        <IconButton
          size="sm"
          icon="down"
          label="Move layer down"
          disabled={!layerId || doc.layers[0]?.id === layerId}
          onClick={() =>
            layerId && apply("Move layer down", (p) => reorderLayer(p, doc.id, layerId, -1))
          }
        />
        <IconButton
          size="sm"
          icon="trash"
          label={selectedLocked ? "Unlock the layer to remove it" : "Remove layer"}
          shortcut="Delete"
          disabled={!layerId || selectedLocked}
          onClick={() => {
            if (!layerId || selectedLocked) return;
            apply("Remove layer", (p) => removeLayer(p, doc.id, layerId));
            select({ layerId: null });
          }}
        />
      </div>
    </div>
  );
}
