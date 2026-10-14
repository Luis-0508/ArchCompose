import { useState } from "react";
import { createDrawingFromAsset, pickAndImport } from "../../app/commands";
import { useShortcuts } from "../../app/shortcuts";
import { addDrawing, DRAWING_KINDS, groupDrawings } from "../../model/drawings";
import { removeElements, translateElement, updateElements } from "../../model/sheet";
import type { Drawing, DrawingKind } from "../../model/types";
import { selectDrawing, useAppStore, type DrawingTool } from "../../state/store";
import { Button, IconButton } from "../../ui/Button";
import { ToolRail, type ChoiceOption } from "../../ui/Choice";
import { EmptyState } from "../../ui/Panel";
import { ViewControls } from "../shared/ViewControls";
import { WorkspaceLayout } from "../WorkspaceLayout";
import styles from "../workspace.module.css";
import { DrawingInspector } from "./DrawingInspector";
import { drawingViewKey, SheetCanvas } from "./SheetCanvas";
import local from "./drawings.module.css";

export { drawingViewKey };

const TOOLS: readonly ChoiceOption<DrawingTool>[] = [
  {
    value: "select",
    label: "Select and transform",
    icon: "select",
    shortcut: "V",
    note: "Drag to move, drag a corner to scale. Shift-click adds to the selection.",
  },
  { value: "hand", label: "Hand", icon: "hand", shortcut: "H", note: "Or hold Space." },
  { value: "pen", label: "Pen", icon: "pen", shortcut: "P", note: "Draw freehand strokes." },
  {
    value: "eraser",
    label: "Eraser",
    icon: "eraser",
    shortcut: "E",
    note: "Cuts strokes and shapes where you drag. Text is removed with the select tool.",
  },
  { value: "line", label: "Line", icon: "line", shortcut: "L", note: "Shift locks to 45°." },
  {
    value: "rect",
    label: "Rectangle",
    icon: "rect",
    shortcut: "R",
    note: "Shift draws a square.",
  },
  {
    value: "circle",
    label: "Circle",
    icon: "circle",
    shortcut: "C",
    note: "Drag from the centre.",
  },
  {
    value: "polyline",
    label: "Polyline",
    icon: "polyline",
    shortcut: "Y",
    note: "Click points. Double-click or Enter finishes, click the first point to close.",
  },
  { value: "text", label: "Text", icon: "text", shortcut: "T", note: "Click to place text." },
];

const TOOL_HINT: Record<DrawingTool, string> = {
  select: "Click to select, drag to move, drag a corner to scale. Double-click text to edit it.",
  hand: "Drag to pan the sheet.",
  pen: "Drag to draw.",
  eraser: "Drag across strokes to erase them.",
  line: "Drag to draw a line. Shift locks the angle to 45°.",
  rect: "Drag to draw a rectangle. Shift draws a square.",
  circle: "Drag from the centre to draw a circle.",
  polyline:
    "Click to add points. Double-click or Enter to finish, Backspace removes a point, Escape cancels.",
  text: "Click on the sheet to type. Enter places the text, Shift+Enter starts a new line.",
};

function newBlankDrawing(kind: DrawingKind) {
  const { apply, select } = useAppStore.getState();
  let id = "";
  apply("New drawing", (p) => {
    const [next, drawing] = addDrawing(p, kind);
    id = drawing.id;
    return next;
  });
  select({ drawingId: id, elementIds: [] });
}

function DrawingSet() {
  const drawings = useAppStore((s) => s.history.present.drawings);
  const selectedId = useAppStore((s) => s.selection.drawingId);
  const select = useAppStore((s) => s.select);
  const [kind, setKind] = useState<DrawingKind>("plan");
  const groups = groupDrawings(drawings);

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
                      {d.sheet.format.preset === "custom" ? "Custom" : d.sheet.format.preset}, 1:
                      {d.scale}
                      {d.level ? `, ${d.level}` : ""}
                      {d.revisions.length ? `, rev ${d.revisions.at(-1)!.code}` : ""}
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
        <Button size="sm" icon="plus" onClick={() => newBlankDrawing(kind)}>
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

function DrawingsEmpty() {
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
          Draw on a blank sheet or annotate exported plans, sections and elevations. Every drawing
          has a paper size, a scale, a sheet number and revisions, and can be placed on boards.
        </p>
        <div className={local.emptyActions}>
          <Button variant="primary" icon="plus" onClick={() => newBlankDrawing("plan")}>
            New blank sheet
          </Button>
          <Button icon="import" onClick={() => void importDrawings()}>
            Import drawing files
          </Button>
        </div>
      </div>
    </div>
  );
}

function useDrawingShortcuts(drawing: Drawing | null) {
  const setTool = useAppStore((s) => s.setDrawingTool);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const selectedIds = useAppStore((s) => s.selection.elementIds);

  const nudge = (dx: number, dy: number) => {
    if (!drawing || selectedIds.length === 0) return;
    apply(selectedIds.length === 1 ? "Nudge element" : "Nudge elements", (p) =>
      updateElements(p, drawing.id, selectedIds, (e) => translateElement(e, dx, dy)),
    );
  };

  const remove = () => {
    if (!drawing || selectedIds.length === 0) return;
    apply(selectedIds.length === 1 ? "Delete element" : "Delete elements", (p) =>
      removeElements(p, drawing.id, selectedIds),
    );
    select({ elementIds: [] });
  };

  useShortcuts(
    {
      V: () => setTool("select"),
      H: () => setTool("hand"),
      P: () => setTool("pen"),
      E: () => setTool("eraser"),
      L: () => setTool("line"),
      R: () => setTool("rect"),
      C: () => setTool("circle"),
      Y: () => setTool("polyline"),
      T: () => setTool("text"),
      Escape: () => select({ elementIds: [] }),
      Delete: remove,
      Backspace: remove,
      ArrowLeft: () => nudge(-1, 0),
      ArrowRight: () => nudge(1, 0),
      ArrowUp: () => nudge(0, -1),
      ArrowDown: () => nudge(0, 1),
      "Shift+ArrowLeft": () => nudge(-10, 0),
      "Shift+ArrowRight": () => nudge(10, 0),
      "Shift+ArrowUp": () => nudge(0, -10),
      "Shift+ArrowDown": () => nudge(0, 10),
    },
    drawing !== null,
  );
}

export function DrawingsWorkspace() {
  const drawing = useAppStore(selectDrawing);
  const count = useAppStore((s) => s.history.present.drawings.length);
  const tool = useAppStore((s) => s.drawingTool);
  const setTool = useAppStore((s) => s.setDrawingTool);
  useDrawingShortcuts(drawing);

  return (
    <WorkspaceLayout
      rail={
        drawing ? (
          <ToolRail label="Drawing tools" value={tool} tools={TOOLS} onChange={setTool} />
        ) : undefined
      }
      leftLabel="Drawing set"
      left={<DrawingSet />}
      context={
        <>
          {drawing ? (
            <>
              <span className={local.contextTitle}>
                <span className={`${local.sheetNo} num`}>{drawing.number}</span>
                <span>{drawing.title}</span>
                <span className={`${styles.contextLabel} num`}>1:{drawing.scale}</span>
              </span>
              <span className={styles.contextRule} aria-hidden />
              <span className={local.hint}>{TOOL_HINT[tool]}</span>
            </>
          ) : (
            <span className={styles.contextLabel}>
              {count > 0 ? "Select a drawing from the set." : "No drawings yet."}
            </span>
          )}
          <span className={styles.contextSpacer} />
          <ViewControls viewKey={drawing ? drawingViewKey(drawing) : null} />
        </>
      }
      center={
        drawing ? (
          <SheetCanvas key={drawing.id} drawing={drawing} />
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
