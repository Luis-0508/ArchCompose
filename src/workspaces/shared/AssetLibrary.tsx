import { useState } from "react";
import { pickAndImport } from "../../app/commands";
import { assetUsage, removeAsset } from "../../model/project";
import type { AssetKind, AssetRef } from "../../model/types";
import { useAssetSource } from "../../state/assetCache";
import { useAppStore } from "../../state/store";
import { Button, IconButton } from "../../ui/Button";
import { Segmented } from "../../ui/Choice";
import { Icon } from "../../ui/Icon";
import { EmptyState } from "../../ui/Panel";
import styles from "../workspace.module.css";
import lib from "./library.module.css";

type Filter = "all" | AssetKind;

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "render", label: "Renders" },
  { value: "cutout", label: "Cut-outs" },
  { value: "drawing", label: "Drawings" },
];

const KIND_LABEL: Record<AssetKind, string> = {
  render: "Render",
  cutout: "Cut-out",
  drawing: "Drawing",
  image: "Image",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function AssetThumb({ asset }: { asset: AssetRef }) {
  const source = useAssetSource(asset.id);
  if (source?.status === "ready") {
    return <img className={styles.thumb} src={source.url} alt="" draggable={false} />;
  }
  if (source?.status === "missing" || !source) {
    return (
      <span className={`${styles.thumb} ${styles.thumbMissing}`} title={source?.reason}>
        <Icon name="warning" size={14} />
      </span>
    );
  }
  return <span className={styles.thumb} aria-label="Loading" />;
}

interface AssetLibraryProps {
  /** Kind given to newly imported files. */
  importKind: AssetKind;
  /** Primary action for an asset, e.g. place it in the open compose view. */
  placeLabel?: string;
  onPlace?: (asset: AssetRef) => void;
  selectedId?: string | null;
  onSelect?: (asset: AssetRef) => void;
}

/** The project's image library. Files stay on disk; the library holds references. */
export function AssetLibrary({
  importKind,
  placeLabel,
  onPlace,
  selectedId,
  onSelect,
}: AssetLibraryProps) {
  const project = useAppStore((s) => s.history.present);
  const apply = useAppStore((s) => s.apply);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const [filter, setFilter] = useState<Filter>("all");
  const assets = project.assetOrder
    .map((id) => project.assets[id]!)
    .filter(
      (a) => filter === "all" || a.kind === filter || (filter === "render" && a.kind === "image"),
    );

  const remove = async (asset: AssetRef) => {
    const uses = assetUsage(project, asset.id);
    if (uses > 0) {
      const ok = await requestConfirm({
        title: `Remove “${asset.name}”?`,
        message: `It is used ${uses === 1 ? "once" : `${uses} times`} in this project. Those layers and frames will be removed or emptied. The file on disk is not touched.`,
        confirmLabel: "Remove from project",
      });
      if (!ok) return;
    }
    apply("Remove image", (p) => removeAsset(p, asset.id));
  };

  return (
    <div className={lib.library}>
      <div className={lib.toolbar}>
        <Segmented
          size="sm"
          label="Filter library"
          value={filter}
          options={FILTERS}
          onChange={setFilter}
        />
        <IconButton
          icon="import"
          label="Import images"
          onClick={() => void pickAndImport(importKind)}
        />
      </div>
      {project.assetOrder.length === 0 ? (
        <EmptyState
          compact
          icon="image"
          title="No images yet"
          actions={
            <Button size="sm" icon="import" onClick={() => void pickAndImport(importKind)}>
              Import images
            </Button>
          }
        >
          <p>
            Add renders, cut-outs of people and trees, or drawings. You can also drop files on the
            window.
          </p>
        </EmptyState>
      ) : assets.length === 0 ? (
        <p className={lib.none}>
          No {FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} in this project.
        </p>
      ) : (
        <ul className={lib.list} aria-label="Images in project">
          {assets.map((asset) => (
            <li key={asset.id} className={lib.item}>
              <button
                type="button"
                className={styles.row}
                aria-current={asset.id === selectedId || undefined}
                onClick={() => onSelect?.(asset)}
                onDoubleClick={() => onPlace?.(asset)}
              >
                <AssetThumb asset={asset} />
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{asset.name}</span>
                  <span className={`${styles.rowMeta} num`}>
                    {KIND_LABEL[asset.kind]}, {asset.width} × {asset.height} px,{" "}
                    {formatBytes(asset.byteSize)}
                  </span>
                </span>
              </button>
              <span className={lib.itemActions}>
                {onPlace && placeLabel ? (
                  <IconButton
                    icon="plus"
                    size="sm"
                    label={placeLabel}
                    onClick={() => onPlace(asset)}
                    tooltipPlacement="left"
                  />
                ) : null}
                <IconButton
                  icon="trash"
                  size="sm"
                  label="Remove from project"
                  onClick={() => void remove(asset)}
                  tooltipPlacement="left"
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
