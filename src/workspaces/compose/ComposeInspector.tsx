import { exportComposeDoc } from "../../app/commands";
import { isAvailableIn } from "../../engine/capabilities";
import {
  ADJUSTMENT_RANGES,
  hasAdjustments,
  NEUTRAL_ADJUSTMENTS,
  renameComposeDoc,
  setHorizon,
  setLayerAdjustments,
  updateLayer,
  type LayerPatch,
} from "../../model/compose";
import type { ComposeDoc, ComposeLayer, LayerAdjustments } from "../../model/types";
import { platform } from "../../platform";
import { useAppStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { NumberField, Readout, SliderField, TextField } from "../../ui/Fields";
import { EmptyState, FactList, PlannedList, Section } from "../../ui/Panel";
import styles from "../workspace.module.css";

function LayerSection({ doc, layer }: { doc: ComposeDoc; layer: ComposeLayer }) {
  const asset = useAppStore((s) => s.history.present.assets[layer.assetId]);
  const apply = useAppStore((s) => s.apply);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const patch = (label: string, value: LayerPatch) =>
    apply(label, (p) => updateLayer(p, doc.id, layer.id, value));
  const scrub = (value: LayerPatch) =>
    applyTransient((p) => updateLayer(p, doc.id, layer.id, value));
  const locked = layer.locked;

  return (
    <Section title="Layer">
      <TextField
        label="Name"
        value={layer.name}
        onCommit={(name) => patch("Rename layer", { name })}
      />
      <div className={styles.fieldGrid}>
        <NumberField
          label="X"
          unit="px"
          value={layer.x}
          disabled={locked}
          onCommit={(x) => patch("Move layer", { x })}
          onScrubStart={beginGesture}
          onScrub={(x) => scrub({ x })}
          onScrubEnd={() => endGesture("Move layer")}
        />
        <NumberField
          label="Y"
          unit="px"
          value={layer.y}
          disabled={locked}
          onCommit={(y) => patch("Move layer", { y })}
          onScrubStart={beginGesture}
          onScrub={(y) => scrub({ y })}
          onScrubEnd={() => endGesture("Move layer")}
        />
        <NumberField
          label="Scale"
          unit="%"
          value={layer.scale * 100}
          precision={1}
          min={1}
          max={2000}
          disabled={locked}
          onCommit={(v) => patch("Scale layer", { scale: v / 100 })}
          onScrubStart={beginGesture}
          onScrub={(v) => scrub({ scale: v / 100 })}
          onScrubEnd={() => endGesture("Scale layer")}
        />
        <Readout
          label="Size"
          value={
            asset
              ? `${Math.round(asset.width * layer.scale)} × ${Math.round(asset.height * layer.scale)} px`
              : "Unknown"
          }
        />
      </div>
      <SliderField
        label="Opacity"
        value={layer.opacity}
        min={0}
        max={1}
        format={(v) => `${Math.round(v * 100)}%`}
        disabled={locked}
        onStart={beginGesture}
        onInput={(opacity) => applyTransient((p) => updateLayer(p, doc.id, layer.id, { opacity }))}
        onEnd={() => endGesture("Change opacity")}
      />
      <div className={styles.buttonRow}>
        <Button
          size="sm"
          icon={layer.visible ? "eyeOff" : "eye"}
          onClick={() =>
            patch(layer.visible ? "Hide layer" : "Show layer", { visible: !layer.visible })
          }
        >
          {layer.visible ? "Hide" : "Show"}
        </Button>
        <Button
          size="sm"
          icon={locked ? "unlock" : "lock"}
          onClick={() => patch(locked ? "Unlock layer" : "Lock layer", { locked: !locked })}
        >
          {locked ? "Unlock" : "Lock"}
        </Button>
      </div>
      {locked ? (
        <p className={styles.rowMeta}>Locked layers cannot be moved on the canvas.</p>
      ) : null}
    </Section>
  );
}

const ADJUSTMENT_FIELDS: readonly {
  key: keyof LayerAdjustments;
  label: string;
  step: number;
  format: (v: number) => string;
}[] = [
  {
    key: "exposure",
    label: "Exposure",
    step: 0.05,
    format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`,
  },
  { key: "brightness", label: "Brightness", step: 1, format: (v) => `${v > 0 ? "+" : ""}${v}` },
  { key: "contrast", label: "Contrast", step: 1, format: (v) => `${v > 0 ? "+" : ""}${v}` },
  { key: "saturation", label: "Saturation", step: 1, format: (v) => `${v > 0 ? "+" : ""}${v}` },
  { key: "blur", label: "Blur", step: 0.5, format: (v) => `${v.toFixed(1)} px` },
  { key: "sharpen", label: "Sharpen", step: 5, format: (v) => `${v}%` },
];

function AdjustmentsSection({ doc, layer }: { doc: ComposeDoc; layer: ComposeLayer }) {
  const apply = useAppStore((s) => s.apply);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const available = isAvailableIn("compose.adjust", platform);
  const values = layer.adjust ?? NEUTRAL_ADJUSTMENTS;
  return (
    <Section title="Adjustments">
      {ADJUSTMENT_FIELDS.map(({ key, label, step, format }) => (
        <SliderField
          key={key}
          label={label}
          value={values[key]}
          min={ADJUSTMENT_RANGES[key][0]}
          max={ADJUSTMENT_RANGES[key][1]}
          step={step}
          format={format}
          disabled={!available}
          onStart={beginGesture}
          onInput={(v) =>
            applyTransient((p) => setLayerAdjustments(p, doc.id, layer.id, { [key]: v }))
          }
          onEnd={() => endGesture("Adjust layer")}
        />
      ))}
      <div className={styles.buttonRow}>
        <Button
          size="sm"
          variant="ghost"
          disabled={!available || !hasAdjustments(layer)}
          onClick={() =>
            apply("Reset adjustments", (p) => setLayerAdjustments(p, doc.id, layer.id, null))
          }
        >
          Reset adjustments
        </Button>
      </div>
      <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
        {available
          ? "Applied by the image engine to this layer only. The image file is not changed."
          : "Adjustments need the desktop app, which includes the image engine."}
      </p>
    </Section>
  );
}

function DocumentSection({ doc }: { doc: ComposeDoc }) {
  const apply = useAppStore((s) => s.apply);
  const setTool = useAppStore((s) => s.setComposeTool);
  return (
    <>
      <Section title="View">
        <TextField
          label="Name"
          value={doc.name}
          onCommit={(name) => apply("Rename view", (p) => renameComposeDoc(p, doc.id, name))}
        />
        <FactList
          facts={[
            ["Canvas", `${doc.width} × ${doc.height} px`],
            ["Aspect", (doc.width / doc.height).toFixed(3)],
            ["Layers", String(doc.layers.length)],
          ]}
        />
      </Section>
      <Section title="Horizon guide">
        {doc.horizonY === null ? (
          <div className={styles.fieldRow}>
            <Button size="sm" icon="horizon" onClick={() => setTool("horizon")}>
              Place horizon
            </Button>
          </div>
        ) : (
          <div className={styles.fieldRow}>
            <NumberField
              label="Height from top"
              unit="px"
              value={doc.horizonY}
              min={0}
              max={doc.height}
              onCommit={(y) => apply("Set horizon", (p) => setHorizon(p, doc.id, y))}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => apply("Remove horizon", (p) => setHorizon(p, doc.id, null))}
            >
              Remove
            </Button>
          </div>
        )}
        <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
          A visual guide for eye level. Perspective calibration is planned.
        </p>
      </Section>
    </>
  );
}

function ExportSection({ doc }: { doc: ComposeDoc }) {
  const available = isAvailableIn("compose.export", platform);
  return (
    <Section title="Export">
      <div className={styles.buttonRow}>
        <Button
          size="sm"
          icon="export"
          disabled={!available}
          onClick={() => void exportComposeDoc(doc.id, "png")}
        >
          Export PNG
        </Button>
        <Button
          size="sm"
          icon="layers"
          disabled={!available}
          onClick={() => void exportComposeDoc(doc.id, "psd")}
        >
          Export layered PSD
        </Button>
      </div>
      <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
        {available
          ? `${doc.width} × ${doc.height} px, rendered by the image engine with transparency.`
          : "Exporting needs the desktop app, which includes the image engine."}
      </p>
    </Section>
  );
}

export function ComposeInspector({
  doc,
  layer,
}: {
  doc: ComposeDoc | null;
  layer: ComposeLayer | null;
}) {
  if (!doc) {
    return (
      <div className={styles.inspectorEmpty}>
        <EmptyState compact title="Nothing selected">
          <p>Properties of the open view and its layers appear here.</p>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className={styles.scroll}>
      {layer ? <LayerSection doc={doc} layer={layer} /> : null}
      {layer ? <AdjustmentsSection doc={doc} layer={layer} /> : null}
      <DocumentSection doc={doc} />
      <ExportSection doc={doc} />
      <Section title="Not available yet" collapsible defaultOpen={!layer}>
        <PlannedList
          title="Needs the image engine or calibration"
          ids={["compose.perspective", "compose.shadow", "compose.mask"]}
        />
      </Section>
    </div>
  );
}
