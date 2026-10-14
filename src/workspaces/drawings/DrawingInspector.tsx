import { useState } from "react";
import { pickAndImport } from "../../app/commands";
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
import type { Drawing, DrawingId, DrawingKind } from "../../model/types";
import { useAppStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { NumberField, SelectField, TextField } from "../../ui/Fields";
import { EmptyState, FactList, PlannedList, Section } from "../../ui/Panel";
import { formatBytes } from "../shared/AssetLibrary";
import styles from "../workspace.module.css";
import local from "./drawings.module.css";

/** Imports a file and attaches it as the drawing's source. */
export async function attachDrawingFile(drawingId: DrawingId): Promise<void> {
  const [ref] = await pickAndImport("drawing");
  if (!ref) return;
  useAppStore
    .getState()
    .apply("Attach drawing file", (p) => updateDrawing(p, drawingId, { sourceAssetId: ref.id }));
}

const SCALE_OPTIONS = [
  ...COMMON_SCALES.map((s) => ({ value: String(s), label: `1:${s}` })),
  { value: "custom", label: "Other scale" },
];

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

export function DrawingInspector({ drawing }: { drawing: Drawing | null }) {
  const apply = useAppStore((s) => s.apply);
  const select = useAppStore((s) => s.select);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const asset = useAppStore((s) =>
    drawing?.sourceAssetId ? s.history.present.assets[drawing.sourceAssetId] : undefined,
  );
  const [customScale, setCustomScale] = useState(false);

  if (!drawing) {
    return (
      <div className={styles.inspectorEmpty}>
        <EmptyState compact title="No drawing selected">
          <p>Sheet number, scale, level and revisions appear here.</p>
        </EmptyState>
      </div>
    );
  }

  const patch = (label: string, value: DrawingPatch) =>
    apply(label, (p) => updateDrawing(p, drawing.id, value));
  const isCommon = (COMMON_SCALES as readonly number[]).includes(drawing.scale);

  return (
    <div className={styles.scroll}>
      <Section title={kindSingular(drawing.kind)}>
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
            value={customScale || !isCommon ? "custom" : String(drawing.scale)}
            options={SCALE_OPTIONS}
            onChange={(value) => {
              if (value === "custom") setCustomScale(true);
              else {
                setCustomScale(false);
                patch("Change scale", { scale: Number(value) });
              }
            }}
          />
          {customScale || !isCommon ? (
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
        {customScale || !isCommon ? (
          <TextField
            label="Level"
            value={drawing.level}
            placeholder="e.g. Ground floor"
            onCommit={(level) => patch("Change level", { level })}
          />
        ) : null}
        <p className={styles.rowMeta} style={{ whiteSpace: "normal" }}>
          The scale is recorded with the drawing. Placing drawings at true scale on boards is
          planned.
        </p>
      </Section>

      <Section title="Drawing file">
        {asset ? (
          <FactList
            facts={[
              ["File", asset.name],
              ["Pixels", `${asset.width} × ${asset.height}`],
              ["Size", formatBytes(asset.byteSize)],
            ]}
          />
        ) : (
          <p className={styles.rowMeta}>No file attached.</p>
        )}
        <div className={styles.buttonRow}>
          <Button size="sm" icon="import" onClick={() => void attachDrawingFile(drawing.id)}>
            {asset ? "Replace file" : "Attach file"}
          </Button>
          {asset ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patch("Detach drawing file", { sourceAssetId: null })}
            >
              Detach
            </Button>
          ) : null}
        </div>
      </Section>

      <Revisions drawing={drawing} />

      <Section title="Not available yet" collapsible defaultOpen={false}>
        <PlannedList ids={["drawings.pdf", "drawings.compare", "boards.scaledPlacement"]} />
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
                "The drawing is removed from the set and from any board frames. The file stays in the library.",
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
