import {
  effectiveDpi,
  formatFor,
  frameRect,
  LIMITS,
  PAPER_PRESETS,
  removeFrame,
  renameBoard,
  setBoardFormat,
  setGrid,
  setTargetDpi,
  updateFrame,
} from "../../model/boards";
import type {
  Board,
  Frame,
  FrameContent,
  Orientation,
  PaperPreset,
  TextRole,
} from "../../model/types";
import type { BoardIssue } from "../../model/validation";
import { useAppStore } from "../../state/store";
import { Button } from "../../ui/Button";
import { Segmented } from "../../ui/Choice";
import { NumberField, SelectField, TextField } from "../../ui/Fields";
import { Icon } from "../../ui/Icon";
import { FactList, PlannedList, Section } from "../../ui/Panel";
import styles from "../workspace.module.css";
import local from "./boards.module.css";

type ContentType = FrameContent["type"];

const TEXT_ROLES: readonly { value: TextRole; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "heading", label: "Heading" },
  { value: "body", label: "Body text" },
  { value: "caption", label: "Caption" },
];

function FrameSection({ board, frame }: { board: Board; frame: Frame }) {
  const project = useAppStore((s) => s.history.present);
  const apply = useAppStore((s) => s.apply);
  const select = useAppStore((s) => s.select);
  const content = frame.content;
  const rect = frameRect(board, frame);
  const setContent = (label: string, next: FrameContent) =>
    apply(label, (p) => updateFrame(p, board.id, frame.id, { content: next }));
  const assets = project.assetOrder.map((id) => project.assets[id]!);

  const changeType = (type: ContentType) => {
    if (type === content.type) return;
    if (type === "empty") setContent("Clear frame", { type: "empty" });
    if (type === "asset") {
      const first = assets[0];
      setContent(
        "Set frame content",
        first ? { type: "asset", assetId: first.id, fit: "cover" } : { type: "empty" },
      );
    }
    if (type === "drawing") {
      const first = project.drawings[0];
      setContent(
        "Set frame content",
        first ? { type: "drawing", drawingId: first.id } : { type: "empty" },
      );
    }
    if (type === "text")
      setContent("Set frame content", { type: "text", role: "heading", text: "" });
  };

  const asset = content.type === "asset" ? project.assets[content.assetId] : undefined;
  const dpi =
    asset && content.type === "asset"
      ? effectiveDpi(asset.width, asset.height, rect.w, rect.h, content.fit)
      : null;

  return (
    <Section title="Frame">
      <SelectField<ContentType>
        label="Content"
        value={content.type}
        options={[
          { value: "empty", label: "Empty" },
          { value: "asset", label: "Image", disabled: assets.length === 0 },
          { value: "drawing", label: "Drawing", disabled: project.drawings.length === 0 },
          { value: "text", label: "Text" },
        ]}
        onChange={changeType}
      />
      {content.type === "asset" ? (
        <>
          <SelectField
            label="Image"
            value={content.assetId}
            options={assets.map((a) => ({ value: a.id, label: a.name }))}
            onChange={(assetId) => setContent("Change image", { ...content, assetId })}
          />
          <Segmented
            size="sm"
            label="Fit"
            value={content.fit}
            options={[
              { value: "cover", label: "Fill frame" },
              { value: "contain", label: "Fit inside" },
            ]}
            onChange={(fit) => setContent("Change fit", { ...content, fit })}
          />
          {dpi !== null ? (
            <p
              className={`${local.dpi} ${dpi < board.targetDpi ? local.dpiLow : ""}`}
              data-testid="frame-dpi"
            >
              <span className="num">{Math.round(dpi)} dpi</span> effective at print size
              {dpi < board.targetDpi ? `, below the ${board.targetDpi} dpi target` : ""}
            </p>
          ) : null}
        </>
      ) : null}
      {content.type === "drawing" ? (
        <SelectField
          label="Drawing"
          value={content.drawingId}
          options={project.drawings.map((d) => ({ value: d.id, label: `${d.number} ${d.title}` }))}
          onChange={(drawingId) => setContent("Change drawing", { type: "drawing", drawingId })}
          hint="Fitted to the frame. True-scale placement is planned."
        />
      ) : null}
      {content.type === "text" ? (
        <>
          <SelectField<TextRole>
            label="Style"
            value={content.role}
            options={TEXT_ROLES}
            onChange={(role) => setContent("Change text style", { ...content, role })}
          />
          <TextField
            label="Text"
            multiline
            value={content.text}
            placeholder="Type the text, then press Ctrl+Enter"
            onCommit={(text) => setContent("Edit text", { ...content, text })}
          />
        </>
      ) : null}
      <div className={styles.fieldGrid}>
        <NumberField
          label="Columns"
          value={frame.colSpan}
          min={1}
          max={board.grid.columns}
          onCommit={(colSpan) =>
            apply("Resize frame", (p) => updateFrame(p, board.id, frame.id, { colSpan }))
          }
        />
        <NumberField
          label="Rows"
          value={frame.rowSpan}
          min={1}
          max={board.grid.rows}
          onCommit={(rowSpan) =>
            apply("Resize frame", (p) => updateFrame(p, board.id, frame.id, { rowSpan }))
          }
        />
      </div>
      <FactList
        facts={[
          ["Frame size", `${rect.w.toFixed(1)} × ${rect.h.toFixed(1)} mm`],
          ["Position", `column ${frame.col + 1}, row ${frame.row + 1}`],
        ]}
      />
      <div className={styles.buttonRow}>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          onClick={() => {
            apply("Remove frame", (p) => removeFrame(p, board.id, frame.id));
            select({ frameId: null });
          }}
        >
          Remove frame
        </Button>
      </div>
    </Section>
  );
}

const SEVERITY_ICON = { error: "error", warning: "warning", info: "info" } as const;

function SubmissionCheck({ issues }: { issues: BoardIssue[] }) {
  const select = useAppStore((s) => s.select);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const summary = errors
    ? `${errors} ${errors === 1 ? "problem" : "problems"} to fix`
    : warnings
      ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}`
      : "Ready for submission";
  return (
    <Section
      title="Submission check"
      actions={
        <span
          className={`${local.checkSummary} ${errors ? local.bad : warnings ? local.warn : local.good}`}
        >
          {summary}
        </span>
      }
    >
      {issues.length === 0 ? (
        <p className={styles.rowMeta}>All frames are filled and resolved.</p>
      ) : (
        <ul className={local.issues} data-testid="board-issues">
          {issues.map((issue, i) => (
            <li key={i}>
              <button
                type="button"
                className={`${local.issue} ${local[issue.severity]}`}
                disabled={!issue.frameId}
                onClick={() => issue.frameId && select({ frameId: issue.frameId })}
              >
                <Icon name={SEVERITY_ICON[issue.severity]} size={14} />
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function BoardInspector({ board, issues }: { board: Board; issues: BoardIssue[] }) {
  const apply = useAppStore((s) => s.apply);
  const frameId = useAppStore((s) => s.selection.frameId);
  const frame = board.frames.find((f) => f.id === frameId);
  const format = board.format;
  const setFormat = (
    preset: PaperPreset,
    orientation: Orientation,
    custom?: { widthMm: number; heightMm: number },
  ) =>
    apply("Change board format", (p) =>
      setBoardFormat(p, board.id, formatFor(preset, orientation, custom ?? format)),
    );

  return (
    <div className={styles.scroll}>
      {frame ? <FrameSection board={board} frame={frame} /> : null}
      <SubmissionCheck issues={issues} />
      <Section title="Sheet" collapsible defaultOpen={!frame}>
        <TextField
          label="Name"
          value={board.name}
          onCommit={(name) => apply("Rename board", (p) => renameBoard(p, board.id, name))}
        />
        <div className={styles.fieldGrid}>
          <SelectField<PaperPreset>
            label="Format"
            value={format.preset}
            options={PAPER_PRESETS.map((p) => ({ value: p, label: p === "custom" ? "Custom" : p }))}
            onChange={(preset) => setFormat(preset, format.orientation)}
          />
          <NumberField
            label="Print target"
            unit="dpi"
            value={board.targetDpi}
            min={LIMITS.targetDpi.min}
            max={LIMITS.targetDpi.max}
            onCommit={(dpi) => apply("Change print target", (p) => setTargetDpi(p, board.id, dpi))}
          />
        </div>
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
      </Section>
      <Section title="Layout grid" collapsible defaultOpen={!frame}>
        <div className={styles.fieldGrid}>
          <NumberField
            label="Columns"
            value={board.grid.columns}
            min={LIMITS.columns.min}
            max={LIMITS.columns.max}
            onCommit={(columns) => apply("Change grid", (p) => setGrid(p, board.id, { columns }))}
          />
          <NumberField
            label="Rows"
            value={board.grid.rows}
            min={LIMITS.rows.min}
            max={LIMITS.rows.max}
            onCommit={(rows) => apply("Change grid", (p) => setGrid(p, board.id, { rows }))}
          />
          <NumberField
            label="Margin"
            unit="mm"
            value={board.grid.marginMm}
            min={LIMITS.marginMm.min}
            max={LIMITS.marginMm.max}
            onCommit={(marginMm) => apply("Change grid", (p) => setGrid(p, board.id, { marginMm }))}
          />
          <NumberField
            label="Gutter"
            unit="mm"
            value={board.grid.gutterMm}
            min={LIMITS.gutterMm.min}
            max={LIMITS.gutterMm.max}
            onCommit={(gutterMm) => apply("Change grid", (p) => setGrid(p, board.id, { gutterMm }))}
          />
        </div>
      </Section>
      <Section title="Not available yet" collapsible defaultOpen={false}>
        <PlannedList ids={["boards.pdf", "boards.scaledPlacement"]} />
      </Section>
    </div>
  );
}
