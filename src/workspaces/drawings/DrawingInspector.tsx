import { useState, type ReactNode } from "react";
import { pickAndImport } from "../../app/commands";
import { formatFor, LIMITS, PAPER_PRESETS } from "../../model/boards";
import {
  addRevision,
  COMMON_SCALES,
  DRAWING_KINDS,
  kindSingular,
  nextRevisionCode,
  removeDrawing,
  updateDrawing,
  type DrawingPatch,
} from "../../model/drawings";
import {
  arrangeElements,
  elementBounds,
  elementLength,
  fitUnderlay,
  formatReal,
  removeElements,
  setElementStroke,
  setSheet,
  setSheetFormat,
  setUnderlay,
  SHEET_LIMITS,
  unionBounds,
  underlaySizeMm,
  updateElements,
} from "../../model/sheet";
import type {
  Drawing,
  DrawingElement,
  DrawingId,
  DrawingKind,
  DrawingUnderlay,
  DrawingUnit,
  Orientation,
  PaperPreset,
  StrokeStyle,
} from "../../model/types";
import { useAppStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { Segmented } from "../../ui/Choice";
import {
  ColorField,
  NumberField,
  Readout,
  SelectField,
  SliderField,
  TextField,
} from "../../ui/Fields";
import { EmptyState, FactList, PlannedList, Section } from "../../ui/Panel";
import { formatBytes } from "../shared/AssetLibrary";
import styles from "../workspace.module.css";
import local from "./drawings.module.css";

/** Imports an image and places it on the drawing's sheet as an underlay to annotate. */
export async function attachDrawingFile(drawingId: DrawingId): Promise<void> {
  const [ref] = await pickAndImport("drawing");
  if (!ref) return;
  useAppStore.getState().apply("Attach underlay image", (p) => {
    const drawing = p.drawings.find((d) => d.id === drawingId);
    if (!drawing) return p;
    return setUnderlay(p, drawingId, fitUnderlay(drawing.sheet.format, ref));
  });
}

const SCALE_OPTIONS = [
  ...COMMON_SCALES.map((s) => ({ value: String(s), label: `1:${s}` })),
  { value: "custom", label: "Other scale" },
];

/** Ink colours common on architectural drawings. Sheet content is ink, not UI. */
const INK_SWATCHES = [
  { value: "#1b1d20", label: "Black" },
  { value: "#6b7078", label: "Grey" },
  { value: "#c0392b", label: "Red" },
  { value: "#1f5fa8", label: "Blue" },
  { value: "#2e7d4f", label: "Green" },
] as const;

const UNIT_OPTIONS: readonly { value: DrawingUnit; label: string }[] = [
  { value: "m", label: "Metres" },
  { value: "cm", label: "Centimetres" },
  { value: "mm", label: "Millimetres" },
];

const TYPE_LABEL: Record<DrawingElement["type"], string> = {
  path: "Pen stroke",
  line: "Line",
  polyline: "Polyline",
  rect: "Rectangle",
  ellipse: "Circle",
  text: "Text",
};

function Revisions({ drawing }: { drawing: Drawing }) {
  const apply = useAppStore((s) => s.apply);
  const [note, setNote] = useState("");
  const add = () => {
    apply("Add revision", (p) => addRevision(p, drawing.id, note.trim()));
    setNote("");
  };
  return (
    <Section
      title="Revisions"
      collapsible
      actions={<span className={`${styles.rowMeta} num`}>{drawing.revisions.length}</span>}
    >
      {drawing.revisions.length > 0 ? (
        <ol className={local.revisions} reversed>
          {[...drawing.revisions].reverse().map((r) => (
            <li key={r.code}>
              <span className={`${local.revCode} num`}>{r.code}</span>
              <span className={local.revNote}>{r.note || "No description"}</span>
              <span className={`${local.revDate} num`}>{r.date}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.rowMeta}>No revisions recorded.</p>
      )}
      <form
        className={styles.fieldRow}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={local.revInput}
          aria-label="Revision description"
          placeholder={`${nextRevisionCode(drawing.revisions)} description`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" type="submit">
          Add revision
        </Button>
      </form>
    </Section>
  );
}

/**
 * Stroke settings. With a selection they change the selected elements (and become the
 * settings for new content); without one they only set up the drawing tools.
 */
function StrokeSection({ drawing, selected }: { drawing: Drawing; selected: DrawingElement[] }) {
  const apply = useAppStore((s) => s.apply);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const settings = useAppStore((s) => s.drawingSettings);
  const setSettings = useAppStore((s) => s.setDrawingSettings);
  const tool = useAppStore((s) => s.drawingTool);
  const ids = selected.map((e) => e.id);
  const stroke: StrokeStyle = selected[0]?.stroke ?? settings.stroke;
  const texts = selected.filter((e) => e.type === "text");

  const change = (label: string, patch: Partial<StrokeStyle>, transient = false) => {
    setSettings({ stroke: { ...stroke, ...patch } });
    if (ids.length === 0) return;
    if (transient) applyTransient((p) => setElementStroke(p, drawing.id, ids, patch));
    else apply(label, (p) => setElementStroke(p, drawing.id, ids, patch));
  };

  const setTextSize = (sizeMm: number) => {
    const size = Math.min(SHEET_LIMITS.textMm.max, Math.max(SHEET_LIMITS.textMm.min, sizeMm));
    setSettings({ textMm: size });
    if (texts.length === 0) return;
    apply("Change text size", (p) =>
      updateElements(
        p,
        drawing.id,
        texts.map((e) => e.id),
        (e) => (e.type === "text" ? { ...e, sizeMm: size } : e),
      ),
    );
  };

  return (
    <Section title={ids.length > 0 ? "Stroke" : "Pen"}>
      <ColorField
        label="Colour"
        value={stroke.color}
        swatches={INK_SWATCHES}
        onCommit={(color) => change("Change colour", { color })}
      />
      <div className={styles.fieldGrid}>
        <NumberField
          label="Width"
          unit="mm"
          value={stroke.widthMm}
          min={SHEET_LIMITS.strokeMm.min}
          max={SHEET_LIMITS.strokeMm.max}
          step={0.05}
          precision={2}
          onCommit={(widthMm) => change("Change stroke width", { widthMm })}
        />
        {tool === "eraser" && ids.length === 0 ? (
          <NumberField
            label="Eraser size"
            unit="mm"
            value={settings.eraserMm * 2}
            min={0.5}
            max={100}
            step={0.5}
            precision={1}
            onCommit={(size) => setSettings({ eraserMm: size / 2 })}
          />
        ) : (
          <NumberField
            label="Text size"
            unit="mm"
            value={texts[0]?.type === "text" ? texts[0].sizeMm : settings.textMm}
            min={SHEET_LIMITS.textMm.min}
            max={SHEET_LIMITS.textMm.max}
            step={0.5}
            precision={1}
            onCommit={setTextSize}
          />
        )}
      </div>
      <SliderField
        label="Opacity"
        value={stroke.opacity}
        min={0.05}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onStart={() => ids.length > 0 && beginGesture()}
        onInput={(opacity) => change("Change opacity", { opacity }, true)}
        onEnd={() => ids.length > 0 && endGesture("Change opacity")}
      />
    </Section>
  );
}

function SelectionSection({ drawing, selected }: { drawing: Drawing; selected: DrawingElement[] }) {
  const apply = useAppStore((s) => s.apply);
  const select = useAppStore((s) => s.select);
  const ids = selected.map((e) => e.id);
  const bounds = unionBounds(selected.map(elementBounds))!;
  const length = selected.reduce((sum, e) => sum + elementLength(e), 0);
  const { scale } = drawing;
  const { unit } = drawing.sheet;
  const single = selected.length === 1 ? selected[0]! : null;
  const title = single ? TYPE_LABEL[single.type] : `${selected.length} elements`;
  const facts: [string, ReactNode][] = [
    ["Size on paper", `${bounds.w.toFixed(1)} × ${bounds.h.toFixed(1)} mm`],
    [
      `Size at 1:${scale}`,
      `${formatReal(bounds.w, scale, unit)} × ${formatReal(bounds.h, scale, unit)}`,
    ],
  ];
  if (length > 0) {
    facts.push(["Length", `${formatReal(length, scale, unit)} (${length.toFixed(1)} mm on paper)`]);
  }

  return (
    <Section title={title}>
      <FactList facts={facts} />
      {single?.type === "text" ? (
        <TextField
          label="Text"
          multiline
          value={single.text}
          onCommit={(text) => {
            if (!text.trim()) return;
            apply("Edit text", (p) =>
              updateElements(p, drawing.id, [single.id], (e) =>
                e.type === "text" ? { ...e, text } : e,
              ),
            );
          }}
        />
      ) : null}
      {single?.type === "polyline" ? (
        <Segmented
          size="sm"
          label="Polyline ends"
          value={single.closed ? "closed" : "open"}
          options={[
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ]}
          onChange={(v) =>
            apply(v === "closed" ? "Close polyline" : "Open polyline", (p) =>
              updateElements(p, drawing.id, [single.id], (e) =>
                e.type === "polyline" ? { ...e, closed: v === "closed" } : e,
              ),
            )
          }
        />
      ) : null}
      <div className={styles.buttonRow}>
        <Button
          size="sm"
          icon="front"
          onClick={() => apply("Bring to front", (p) => arrangeElements(p, drawing.id, ids, 1))}
        >
          Bring to front
        </Button>
        <Button
          size="sm"
          icon="back"
          onClick={() => apply("Send to back", (p) => arrangeElements(p, drawing.id, ids, -1))}
        >
          Send to back
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          onClick={() => {
            apply(ids.length === 1 ? "Delete element" : "Delete elements", (p) =>
              removeElements(p, drawing.id, ids),
            );
            select({ elementIds: [] });
          }}
        >
          Delete
        </Button>
      </div>
    </Section>
  );
}

function SheetSection({ drawing }: { drawing: Drawing }) {
  const apply = useAppStore((s) => s.apply);
  const { format, grid } = drawing.sheet;
  const setFormat = (
    preset: PaperPreset,
    orientation: Orientation,
    custom?: { widthMm: number; heightMm: number },
  ) =>
    apply("Change paper size", (p) =>
      setSheetFormat(p, drawing.id, formatFor(preset, orientation, custom ?? format)),
    );

  return (
    <Section title="Sheet" collapsible>
      <SelectField<PaperPreset>
        label="Paper"
        value={format.preset}
        options={PAPER_PRESETS.map((p) => ({ value: p, label: p === "custom" ? "Custom" : p }))}
        onChange={(preset) => setFormat(preset, format.orientation)}
      />
      {format.preset === "custom" ? (
        <div className={styles.fieldGrid}>
          <NumberField
            label="Width"
            unit="mm"
            value={format.widthMm}
            min={LIMITS.sheetMm.min}
            max={LIMITS.sheetMm.max}
            onCommit={(widthMm) =>
              setFormat("custom", format.orientation, { widthMm, heightMm: format.heightMm })
            }
          />
          <NumberField
            label="Height"
            unit="mm"
            value={format.heightMm}
            min={LIMITS.sheetMm.min}
            max={LIMITS.sheetMm.max}
            onCommit={(heightMm) =>
              setFormat("custom", format.orientation, { widthMm: format.widthMm, heightMm })
            }
          />
        </div>
      ) : (
        <Segmented<Orientation>
          size="sm"
          label="Orientation"
          value={format.orientation}
          options={[
            { value: "landscape", label: "Landscape" },
            { value: "portrait", label: "Portrait" },
          ]}
          onChange={(o) => setFormat(format.preset, o)}
        />
      )}
      <p className={`${styles.rowMeta} num`} style={{ whiteSpace: "normal" }}>
        {format.widthMm} × {format.heightMm} mm of paper, which covers{" "}
        {formatReal(format.widthMm, drawing.scale, drawing.sheet.unit)} ×{" "}
        {formatReal(format.heightMm, drawing.scale, drawing.sheet.unit)} at 1:{drawing.scale}.
      </p>
      <div className={styles.fieldGrid}>
        <NumberField
          label="Grid spacing"
          unit="mm"
          value={grid.spacingMm}
          min={SHEET_LIMITS.gridMm.min}
          max={SHEET_LIMITS.gridMm.max}
          precision={1}
          onCommit={(spacingMm) =>
            apply("Change grid spacing", (p) => setSheet(p, drawing.id, { grid: { spacingMm } }))
          }
        />
        <SelectField<DrawingUnit>
          label="Real units"
          value={drawing.sheet.unit}
          options={UNIT_OPTIONS}
          onChange={(unit) =>
            apply("Change drawing units", (p) => setSheet(p, drawing.id, { unit }))
          }
        />
      </div>
      <Segmented
        size="sm"
        label="Grid"
        value={grid.visible ? "shown" : "hidden"}
        options={[
          { value: "shown", label: "Show grid" },
          { value: "hidden", label: "Hide grid" },
        ]}
        onChange={(v) =>
          apply(v === "shown" ? "Show grid" : "Hide grid", (p) =>
            setSheet(p, drawing.id, { grid: { visible: v === "shown" } }),
          )
        }
      />
      <Segmented
        size="sm"
        label="Snapping"
        value={grid.snap ? "on" : "off"}
        options={[
          { value: "on", label: "Snap to grid" },
          { value: "off", label: "Free" },
        ]}
        onChange={(v) =>
          apply(v === "on" ? "Turn on snapping" : "Turn off snapping", (p) =>
            setSheet(p, drawing.id, { grid: { snap: v === "on" } }),
          )
        }
      />
      <Segmented
        size="sm"
        label="Rulers"
        value={drawing.sheet.rulers ? "shown" : "hidden"}
        options={[
          { value: "shown", label: "Show rulers" },
          { value: "hidden", label: "Hide rulers" },
        ]}
        onChange={(v) =>
          apply(v === "shown" ? "Show rulers" : "Hide rulers", (p) =>
            setSheet(p, drawing.id, { rulers: v === "shown" }),
          )
        }
      />
    </Section>
  );
}

function UnderlaySection({ drawing }: { drawing: Drawing }) {
  const apply = useAppStore((s) => s.apply);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const underlay = drawing.underlay;
  const asset = useAppStore((s) =>
    underlay ? s.history.present.assets[underlay.assetId] : undefined,
  );

  if (!underlay || !asset) {
    return (
      <Section title="Image underlay" collapsible>
        <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
          Place an exported plan or a scan on the sheet to draw over it.
        </p>
        <div className={styles.buttonRow}>
          <Button size="sm" icon="import" onClick={() => void attachDrawingFile(drawing.id)}>
            Attach image
          </Button>
        </div>
      </Section>
    );
  }

  const size = underlaySizeMm(asset, underlay.dpi);
  const patch = (label: string, value: Partial<DrawingUnderlay>) =>
    apply(label, (p) => setUnderlay(p, drawing.id, { ...underlay, ...value }));

  return (
    <Section title="Image underlay" collapsible>
      <FactList
        facts={[
          ["File", asset.name],
          ["Pixels", `${asset.width} × ${asset.height}`],
          ["On paper", `${size.w.toFixed(1)} × ${size.h.toFixed(1)} mm`],
          ["File size", formatBytes(asset.byteSize)],
        ]}
      />
      <div className={styles.fieldGrid}>
        <NumberField
          label="Resolution"
          unit="dpi"
          value={underlay.dpi}
          min={SHEET_LIMITS.underlayDpi.min}
          max={SHEET_LIMITS.underlayDpi.max}
          onCommit={(dpi) => patch("Change underlay resolution", { dpi })}
        />
        <Readout label="Drawing scale" value={`1:${drawing.scale}`} />
        <NumberField
          label="Left"
          unit="mm"
          value={underlay.xMm}
          precision={1}
          onCommit={(xMm) => patch("Move underlay", { xMm })}
        />
        <NumberField
          label="Top"
          unit="mm"
          value={underlay.yMm}
          precision={1}
          onCommit={(yMm) => patch("Move underlay", { yMm })}
        />
      </div>
      <SliderField
        label="Underlay opacity"
        value={underlay.opacity}
        min={0.05}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onStart={beginGesture}
        onInput={(opacity) =>
          applyTransient((p) => setUnderlay(p, drawing.id, { ...underlay, opacity }))
        }
        onEnd={() => endGesture("Change underlay opacity")}
      />
      <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
        The resolution sets the printed size of the image. It does not change the drawing scale.
      </p>
      <div className={styles.buttonRow}>
        <Button
          size="sm"
          onClick={() =>
            apply("Fit underlay to sheet", (p) =>
              setUnderlay(p, drawing.id, {
                ...fitUnderlay(drawing.sheet.format, asset),
                opacity: underlay.opacity,
              }),
            )
          }
        >
          Fit to sheet
        </Button>
        <Button size="sm" icon="import" onClick={() => void attachDrawingFile(drawing.id)}>
          Replace
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => apply("Remove underlay", (p) => setUnderlay(p, drawing.id, null))}
        >
          Remove
        </Button>
      </div>
    </Section>
  );
}

export function DrawingInspector({ drawing }: { drawing: Drawing | null }) {
  const apply = useAppStore((s) => s.apply);
  const select = useAppStore((s) => s.select);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const selectedIds = useAppStore((s) => s.selection.elementIds);
  const [customScale, setCustomScale] = useState(false);

  if (!drawing) {
    return (
      <div className={styles.inspectorEmpty}>
        <EmptyState compact title="No drawing selected">
          <p>Sheet, scale, pen settings and revisions appear here.</p>
        </EmptyState>
      </div>
    );
  }

  const selectedSet = new Set(selectedIds);
  const selected = drawing.elements.filter((e) => selectedSet.has(e.id));
  const patch = (label: string, value: DrawingPatch) =>
    apply(label, (p) => updateDrawing(p, drawing.id, value));
  const isCommon = (COMMON_SCALES as readonly number[]).includes(drawing.scale);
  const showCustom = customScale || !isCommon;

  return (
    <div className={styles.scroll}>
      {selected.length > 0 ? <SelectionSection drawing={drawing} selected={selected} /> : null}
      <StrokeSection drawing={drawing} selected={selected} />

      <Section title={kindSingular(drawing.kind)} collapsible defaultOpen={selected.length === 0}>
        <div className={styles.fieldGrid}>
          <TextField
            label="Sheet number"
            value={drawing.number}
            onCommit={(number) =>
              number.trim() && patch("Renumber drawing", { number: number.trim() })
            }
          />
          <SelectField<DrawingKind>
            label="Kind"
            value={drawing.kind}
            options={DRAWING_KINDS.map((k) => ({ value: k.kind, label: kindSingular(k.kind) }))}
            onChange={(kind) => patch("Change drawing kind", { kind })}
          />
        </div>
        <TextField
          label="Title"
          value={drawing.title}
          onCommit={(title) => title.trim() && patch("Rename drawing", { title: title.trim() })}
        />
        <div className={styles.fieldGrid}>
          <SelectField
            label="Scale"
            value={showCustom ? "custom" : String(drawing.scale)}
            options={SCALE_OPTIONS}
            onChange={(value) => {
              if (value === "custom") setCustomScale(true);
              else {
                setCustomScale(false);
                patch("Change scale", { scale: Number(value) });
              }
            }}
          />
          {showCustom ? (
            <NumberField
              label="1 :"
              value={drawing.scale}
              min={1}
              max={100000}
              onCommit={(scale) => patch("Change scale", { scale })}
            />
          ) : (
            <TextField
              label="Level"
              value={drawing.level}
              placeholder="e.g. Ground floor"
              onCommit={(level) => patch("Change level", { level })}
            />
          )}
        </div>
        {showCustom ? (
          <TextField
            label="Level"
            value={drawing.level}
            placeholder="e.g. Ground floor"
            onCommit={(level) => patch("Change level", { level })}
          />
        ) : null}
        <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
          Content is drawn in paper millimetres. The scale converts paper lengths to real lengths;
          changing it does not move anything on the sheet.
        </p>
      </Section>

      <SheetSection drawing={drawing} />
      <UnderlaySection drawing={drawing} />
      <Revisions drawing={drawing} />

      <Section title="Not available yet" collapsible defaultOpen={false}>
        <PlannedList
          ids={["drawings.export", "drawings.pdf", "drawings.compare", "boards.scaledPlacement"]}
        />
      </Section>

      <div className={local.dangerZone}>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          onClick={async () => {
            const ok = await requestConfirm({
              title: `Remove ${drawing.number}?`,
              message:
                "The drawing and everything drawn on it are removed from the set and from any board frames. Image files stay in the library.",
              confirmLabel: "Remove drawing",
            });
            if (!ok) return;
            apply("Remove drawing", (p) => removeDrawing(p, drawing.id));
            select({ drawingId: null });
          }}
        >
          Remove drawing
        </Button>
      </div>
    </div>
  );
}
