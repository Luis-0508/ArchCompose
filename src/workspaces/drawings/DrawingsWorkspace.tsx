import { useState } from "react";
import { createDrawingFromAsset, pickAndImport } from "../../app/commands";
import { addDrawing, DRAWING_KINDS, groupDrawings } from "../../model/drawings";
import type { Drawing, DrawingKind } from "../../model/types";
import { useAssetSource } from "../../state/assetCache";
import { selectDrawing, useAppStore } from "../../state/store";
import { Button, IconButton } from "../../ui/Button";
import { EmptyState } from "../../ui/Panel";
import { Viewport } from "../../viewport/Viewport";
import { ViewControls } from "../shared/ViewControls";
import { WorkspaceLayout } from "../WorkspaceLayout";
import styles from "../workspace.module.css";
import { DrawingInspector, attachDrawingFile } from "./DrawingInspector";
import local from "./drawings.module.css";

export const drawingViewKey = (d: Drawing) => `drawing:${d.id}`;

function DrawingSet() {
  const drawings = useAppStore((s) => s.history.present.drawings);
  const selectedId = useAppStore((s) => s.selection.drawingId);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const [kind, setKind] = useState<DrawingKind>("plan");
  const groups = groupDrawings(drawings);

  const add = () => {
    let id = "";
    apply("New drawing", (p) => {
      const [next, drawing] = addDrawing(p, kind);
      id = drawing.id;
      return next;
    });
    select({ drawingId: id });
  };

  return (
    <>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Drawing set</h2>
        <IconButton
          icon="import"
          label="Import drawing files"
          onClick={() => void importDrawings()}
        />
      </div>
      <div className={styles.scroll}>
        {groups.length === 0 ? (
          <EmptyState compact icon="drawings" title="No drawings yet">
            <p>Add plans, sections and elevations. Each one gets a sheet number.</p>
          </EmptyState>
        ) : (
          groups.map((group) => (
            <div key={group.kind} role="group" aria-label={group.label}>
              <p className={styles.listGroupLabel}>{group.label}</p>
              {group.drawings.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={styles.row}
                  aria-current={d.id === selectedId || undefined}
                  onClick={() => select({ drawingId: d.id })}
                >
                  <span className={`${local.sheetNo} num`}>{d.number}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{d.title}</span>
                    <span className={`${styles.rowMeta} num`}>
                      1:{d.scale}
                      {d.level ? `, ${d.level}` : ""}
                      {d.revisions.length ? `, rev ${d.revisions.at(-1)!.code}` : ""}
                      {d.sourceAssetId ? "" : ", no file"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      <div className={local.addBar}>
        <select
          aria-label="Kind of drawing to add"
          className={local.kindSelect}
          value={kind}
          onChange={(e) => setKind(e.target.value as DrawingKind)}
        >
          {DRAWING_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label.replace(/s$/, "")}
            </option>
          ))}
        </select>
        <Button size="sm" icon="plus" onClick={add}>
          Add drawing
        </Button>
      </div>
    </>
  );
}

async function importDrawings() {
  const refs = await pickAndImport("drawing");
  for (const ref of refs) createDrawingFromAsset(ref);
}

function DrawingSheet({ drawing }: { drawing: Drawing }) {
  const asset = useAppStore((s) =>
    drawing.sourceAssetId ? s.history.present.assets[drawing.sourceAssetId] : undefined,
  );
  const source = useAssetSource(asset?.id);

  if (!asset) {
    return (
      <div className={styles.centered}>
        <EmptyState
          icon="file"
          title={`${drawing.number} has no drawing file`}
          actions={
            <Button
              variant="primary"
              icon="import"
              onClick={() => void attachDrawingFile(drawing.id)}
            >
              Attach drawing file
            </Button>
          }
        >
          <p>
            Attach an exported plan, section or elevation as PNG, JPEG or SVG. PDF import is
            planned.
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <Viewport
      viewKey={drawingViewKey(drawing)}
      content={{ width: asset.width, height: asset.height }}
      unit="px"
      label={`Drawing ${drawing.number}`}
      surface="desk"
    >
      <div className={local.sheet} style={{ width: asset.width, height: asset.height }}>
        {source?.status === "ready" ? (
          <img src={source.url} alt="" draggable={false} className={local.sheetImage} />
        ) : (
          <div className={local.sheetMissing}>
            {source?.status === "loading" ? "Loading" : `Missing file: ${asset.name}`}
          </div>
        )}
      </div>
    </Viewport>
  );
}

function DrawingsEmpty() {
  const apply = useAppStore((s) => s.apply);
  const select = useAppStore((s) => s.select);
  return (
    <div className={styles.centered}>
      <div className={local.empty}>
        <svg viewBox="0 0 240 120" className={local.emptyDrawing} aria-hidden>
          {/* A small plan with a section cut line through it. */}
          <rect x="40" y="20" width="160" height="80" />
          <line x1="110" y1="20" x2="110" y2="70" />
          <line x1="40" y1="70" x2="150" y2="70" />
          <line x1="20" y1="60" x2="220" y2="60" className={local.cut} />
          <circle cx="14" cy="60" r="6" className={local.cutMark} />
          <circle cx="226" cy="60" r="6" className={local.cutMark} />
        </svg>
        <h1 className={local.emptyTitle}>Build the drawing set</h1>
        <p className={local.emptyBody}>
          Collect plans, sections and elevations with sheet numbers, scales and revisions. Drawings
          can be placed on presentation boards.
        </p>
        <div className={local.emptyActions}>
          <Button variant="primary" icon="import" onClick={() => void importDrawings()}>
            Import drawing files
          </Button>
          <Button
            icon="plus"
            onClick={() => {
              let id = "";
              apply("New drawing", (p) => {
                const [next, d] = addDrawing(p, "plan");
                id = d.id;
                return next;
              });
              select({ drawingId: id });
            }}
          >
            Add empty plan
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DrawingsWorkspace() {
  const drawing = useAppStore(selectDrawing);
  const count = useAppStore((s) => s.history.present.drawings.length);

  return (
    <WorkspaceLayout
      leftLabel="Drawing set"
      left={<DrawingSet />}
      context={
        <>
          {drawing ? (
            <span className={local.contextTitle}>
              <span className={`${local.sheetNo} num`}>{drawing.number}</span>
              <span>{drawing.title}</span>
              <span className={`${styles.contextLabel} num`}>1:{drawing.scale}</span>
            </span>
          ) : (
            <span className={styles.contextLabel}>
              {count > 0 ? "Select a drawing from the set." : "No drawings yet."}
            </span>
          )}
          <span className={styles.contextSpacer} />
          <ViewControls viewKey={drawing?.sourceAssetId ? drawingViewKey(drawing) : null} />
        </>
      }
      center={
        drawing ? (
          <DrawingSheet key={drawing.id} drawing={drawing} />
        ) : count > 0 ? (
          <div className={styles.centered}>
            <EmptyState icon="drawings" title="No drawing selected">
              <p>Choose a drawing from the set on the left.</p>
            </EmptyState>
          </div>
        ) : (
          <DrawingsEmpty />
        )
      }
      rightLabel="Drawing properties"
      right={<DrawingInspector drawing={drawing} />}
    />
  );
}
