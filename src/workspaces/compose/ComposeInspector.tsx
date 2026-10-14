import { renameComposeDoc, setHorizon, updateLayer, type LayerPatch } from "../../model/compose";
import type { ComposeDoc, ComposeLayer } from "../../model/types";
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
      <DocumentSection doc={doc} />
      <Section title="Not available yet" collapsible defaultOpen={!layer}>
        <PlannedList
          title="Needs the image engine or calibration"
          ids={[
            "compose.perspective",
            "compose.shadow",
            "compose.mask",
            "compose.adjust",
            "compose.export",
          ]}
        />
      </Section>
    </div>
  );
}
