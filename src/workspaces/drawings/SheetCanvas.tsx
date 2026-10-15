import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  addElements,
  constrainAngle,
  elementBounds,
  elementsInRect,
  eraseElements,
  hitTestElements,
  makeCircle,
  makeLine,
  makePath,
  makePolyline,
  makeRect,
  makeText,
  removeElements,
  replaceElements,
  simplifyPath,
  snapToGrid,
  transformElement,
  unionBounds,
  updateElements,
  type Rect,
} from "../../model/sheet";
import type { Drawing, DrawingElement, ElementId, SheetPoint } from "../../model/types";
import { useAppStore } from "../../state/store";
import { contentToScreen, screenToContent, type Camera } from "../../viewport/camera";
import { trackDrag } from "../../viewport/trackDrag";
import { Viewport, type ViewportPointer } from "../../viewport/Viewport";
import { ElementShape, SheetSvg } from "./SheetSvg";
import local from "./drawings.module.css";

export const drawingViewKey = (d: Pick<Drawing, "id">) => `drawing:${d.id}`;

/** Screen pixels within which the pointer hits a stroke. */
const HIT_PX = 5;

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

interface TextEdit {
  /** Element being edited, or null for new text. */
  id: ElementId | null;
  at: SheetPoint;
  text: string;
  sizeMm: number;
  color: string;
}

function stageOf(event: { currentTarget: EventTarget | null }): HTMLElement {
  return (event.currentTarget as HTMLElement).closest("[data-testid^='viewport-']") as HTMLElement;
}

export function SheetCanvas({ drawing }: { drawing: Drawing }) {
  const tool = useAppStore((s) => s.drawingTool);
  const settings = useAppStore((s) => s.drawingSettings);
  const selectedIds = useAppStore((s) => s.selection.elementIds);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const beginGesture = useAppStore((s) => s.beginGesture);
  const applyTransient = useAppStore((s) => s.applyTransient);
  const endGesture = useAppStore((s) => s.endGesture);
  const viewKey = drawingViewKey(drawing);
  const camera = useAppStore((s) => s.views[viewKey]?.camera);

  const [draft, setDraft] = useState<DrawingElement | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [polyline, setPolyline] = useState<SheetPoint[] | null>(null);
  const [hover, setHover] = useState<SheetPoint | null>(null);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const lastClick = useRef({ time: 0, x: 0, y: 0 });

  /** Pointer-down events carry no click count, so double clicks are detected here. */
  const isDoubleClick = (event: ReactPointerEvent) => {
    const prev = lastClick.current;
    const double =
      event.timeStamp - prev.time < 450 &&
      Math.hypot(event.clientX - prev.x, event.clientY - prev.y) < 6;
    lastClick.current = double
      ? { time: 0, x: 0, y: 0 }
      : { time: event.timeStamp, x: event.clientX, y: event.clientY };
    return double;
  };

  const { grid } = drawing.sheet;
  const selectedSet = new Set(selectedIds);
  const selected = drawing.elements.filter((e) => selectedSet.has(e.id));
  const setSelection = (elementIds: ElementId[]) => select({ elementIds });

  const snap = (p: SheetPoint, force = false): SheetPoint =>
    grid.snap || force ? snapToGrid(p, grid.spacingMm) : p;

  /** Converts a window pointer event to paper millimetres. */
  const toSheet = (event: { clientX: number; clientY: number }, cam: Camera): SheetPoint => {
    const rect = stageRef.current!.getBoundingClientRect();
    const p = screenToContent(cam, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    return [p.x, p.y];
  };

  // Switching tools discards an unfinished polyline. (The canvas remounts per drawing.)
  const [toolInUse, setToolInUse] = useState(tool);
  if (toolInUse !== tool) {
    setToolInUse(tool);
    setPolyline(null);
  }

  const finishPolyline = (points: SheetPoint[] | null, closed = false) => {
    setPolyline(null);
    if (!points || points.length < 2) return;
    const element = makePolyline(points, closed && points.length > 2, settings.stroke);
    apply("Draw polyline", (p) => addElements(p, drawing.id, [element]));
  };

  const commitText = (edit: TextEdit | null) => {
    setTextEdit(null);
    if (!edit) return;
    const text = edit.text.replace(/\s+$/, "");
    if (edit.id) {
      const id = edit.id;
      if (!text) {
        apply("Remove text", (p) => removeElements(p, drawing.id, [id]));
        setSelection([]);
      } else {
        apply("Edit text", (p) =>
          updateElements(p, drawing.id, [id], (e) => (e.type === "text" ? { ...e, text } : e)),
        );
      }
      return;
    }
    if (!text) return;
    const element = makeText(edit.at, text, edit.sizeMm, settings.stroke);
    apply("Add text", (p) => addElements(p, drawing.id, [element]));
    setSelection([element.id]);
  };

  // ---------------------------------------------------------------- select tool

  const startMove = (pointer: ViewportPointer, ids: ElementId[]) => {
    const start = pointer.content;
    const startSnapped = snap([start.x, start.y]);
    const base = drawing.elements;
    const moving = new Set(ids);
    let moved = false;
    trackDrag(
      pointer.event,
      (event) => {
        const p = toSheet(event, pointer.camera);
        if (!moved && Math.hypot(p[0] - start.x, p[1] - start.y) * pointer.camera.zoom < 3) return;
        if (!moved) {
          moved = true;
          beginGesture();
        }
        const s = snap(p);
        let dx = s[0] - startSnapped[0];
        let dy = s[1] - startSnapped[1];
        if (event.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const next = base.map((e) =>
          moving.has(e.id) ? transformElement(e, { sx: 1, sy: 1, dx, dy, ox: 0, oy: 0 }) : e,
        );
        applyTransient((p) => replaceElements(p, drawing.id, next));
      },
      () => {
        if (moved) endGesture(ids.length === 1 ? "Move element" : "Move elements");
      },
    );
  };

  const startMarquee = (pointer: ViewportPointer, additive: boolean) => {
    const start: SheetPoint = [pointer.content.x, pointer.content.y];
    const before = selectedIds;
    trackDrag(
      pointer.event,
      (event) => {
        const p = toSheet(event, pointer.camera);
        setMarquee({
          x: Math.min(start[0], p[0]),
          y: Math.min(start[1], p[1]),
          w: Math.abs(p[0] - start[0]),
          h: Math.abs(p[1] - start[1]),
        });
      },
      (event) => {
        setMarquee(null);
        if (!event) return;
        const p = toSheet(event, pointer.camera);
        const rect = {
          x: Math.min(start[0], p[0]),
          y: Math.min(start[1], p[1]),
          w: Math.abs(p[0] - start[0]),
          h: Math.abs(p[1] - start[1]),
        };
        const inside = elementsInRect(drawing.elements, rect);
        setSelection(additive ? [...new Set([...before, ...inside])] : inside);
      },
    );
  };

  const startScale = (corner: Corner, event: ReactPointerEvent, cam: Camera) => {
    const bounds = unionBounds(selected.map(elementBounds));
    if (!bounds) return;
    event.stopPropagation();
    stageRef.current = stageOf(event);
    const anchor: SheetPoint = [
      corner.includes("w") ? bounds.x + bounds.w : bounds.x,
      corner.includes("n") ? bounds.y + bounds.h : bounds.y,
    ];
    const handle: SheetPoint = [
      corner.includes("w") ? bounds.x : bounds.x + bounds.w,
      corner.includes("n") ? bounds.y : bounds.y + bounds.h,
    ];
    const base = drawing.elements;
    const ids = new Set(selected.map((e) => e.id));
    beginGesture();
    trackDrag(
      event,
      (move) => {
        const p = snap(toSheet(move, cam));
        const spanX = handle[0] - anchor[0];
        const spanY = handle[1] - anchor[1];
        let sx = spanX === 0 ? 1 : (p[0] - anchor[0]) / spanX;
        let sy = spanY === 0 ? 1 : (p[1] - anchor[1]) / spanY;
        if (move.shiftKey || spanX === 0 || spanY === 0) {
          const s = spanX === 0 ? sy : spanY === 0 ? sx : Math.max(sx, sy);
          sx = s;
          sy = s;
        }
        // Avoid collapsing content to nothing.
        sx = Math.sign(sx || 1) * Math.max(Math.abs(sx), 0.01);
        sy = Math.sign(sy || 1) * Math.max(Math.abs(sy), 0.01);
        const t = { sx, sy, dx: 0, dy: 0, ox: anchor[0], oy: anchor[1] };
        const next = base.map((e) => (ids.has(e.id) ? transformElement(e, t) : e));
        applyTransient((proj) => replaceElements(proj, drawing.id, next));
      },
      () => endGesture(ids.size === 1 ? "Scale element" : "Scale elements"),
    );
  };

  // ---------------------------------------------------------------- drawing tools

  const startPen = (pointer: ViewportPointer) => {
    const points: SheetPoint[] = [[pointer.content.x, pointer.content.y]];
    setDraft(makePath(points, settings.stroke));
    trackDrag(
      pointer.event,
      (event) => {
        points.push(toSheet(event, pointer.camera));
        setDraft(makePath(points, settings.stroke));
      },
      (event) => {
        setDraft(null);
        if (!event) return;
        // Drop detail finer than half a screen pixel at the zoom the stroke was drawn at.
        const simplified = simplifyPath(points, 0.5 / pointer.camera.zoom);
        const element = makePath(simplified, settings.stroke);
        apply("Draw with pen", (p) => addElements(p, drawing.id, [element]));
      },
    );
  };

  const startEraser = (pointer: ViewportPointer) => {
    let last: SheetPoint = [pointer.content.x, pointer.content.y];
    let started = false;
    const eraseAlong = (track: SheetPoint[]) => {
      const current = useAppStore
        .getState()
        .history.present.drawings.find((d) => d.id === drawing.id);
      if (!current) return;
      const next = eraseElements(current.elements, track, settings.eraserMm);
      if (next === current.elements) return;
      if (!started) {
        started = true;
        beginGesture();
      }
      applyTransient((p) => replaceElements(p, drawing.id, next));
    };
    eraseAlong([last]);
    trackDrag(
      pointer.event,
      (event) => {
        const p = toSheet(event, pointer.camera);
        setHover(p);
        eraseAlong([last, p]);
        last = p;
      },
      () => {
        if (started) endGesture("Erase");
        setSelection(
          selectedIds.filter((id) =>
            useAppStore
              .getState()
              .history.present.drawings.find((d) => d.id === drawing.id)
              ?.elements.some((e) => e.id === id),
          ),
        );
      },
    );
  };

  const startShape = (pointer: ViewportPointer, kind: "line" | "rect" | "circle") => {
    const start = snap([pointer.content.x, pointer.content.y]);
    const build = (p: SheetPoint, shift: boolean): DrawingElement => {
      if (kind === "line")
        return makeLine(start, shift ? constrainAngle(start, p) : p, settings.stroke);
      if (kind === "circle")
        return makeCircle(start, Math.hypot(p[0] - start[0], p[1] - start[1]), settings.stroke);
      if (shift) {
        const side = Math.max(Math.abs(p[0] - start[0]), Math.abs(p[1] - start[1]));
        p = [
          start[0] + Math.sign(p[0] - start[0] || 1) * side,
          start[1] + Math.sign(p[1] - start[1] || 1) * side,
        ];
      }
      return makeRect(start, p, settings.stroke);
    };
    let element: DrawingElement | null = null;
    trackDrag(
      pointer.event,
      (event) => {
        element = build(snap(toSheet(event, pointer.camera)), event.shiftKey);
        setDraft(element);
      },
      (event) => {
        setDraft(null);
        if (!event || !element) return;
        const b = elementBounds(element);
        if (Math.max(b.w, b.h) * pointer.camera.zoom < 2) return;
        const done = element;
        const label =
          kind === "line" ? "Draw line" : kind === "rect" ? "Draw rectangle" : "Draw circle";
        apply(label, (p) => addElements(p, drawing.id, [done]));
        setSelection([done.id]);
      },
    );
  };

  const onToolPointerDown = (pointer: ViewportPointer) => {
    stageRef.current = stageOf(pointer.event);
    if (textEdit) {
      commitText(textEdit);
      return;
    }
    const at: SheetPoint = [pointer.content.x, pointer.content.y];
    const double = isDoubleClick(pointer.event);
    switch (tool) {
      case "select": {
        const hit = hitTestElements(drawing.elements, at, HIT_PX / pointer.camera.zoom);
        const additive = pointer.event.shiftKey;
        if (!hit) {
          if (!additive) setSelection([]);
          startMarquee(pointer, additive);
          return;
        }
        if (double && hit.type === "text") {
          // Keep the browser from moving focus away from the editor that opens now.
          pointer.event.preventDefault();
          setTextEdit({
            id: hit.id,
            at: [hit.x, hit.y],
            text: hit.text,
            sizeMm: hit.sizeMm,
            color: hit.stroke.color,
          });
          setSelection([hit.id]);
          return;
        }
        if (additive) {
          setSelection(
            selectedSet.has(hit.id)
              ? selectedIds.filter((id) => id !== hit.id)
              : [...selectedIds, hit.id],
          );
          return;
        }
        const ids = selectedSet.has(hit.id) ? selectedIds : [hit.id];
        setSelection(ids);
        startMove(pointer, ids);
        return;
      }
      case "pen":
        startPen(pointer);
        return;
      case "eraser":
        startEraser(pointer);
        return;
      case "line":
      case "rect":
      case "circle":
        startShape(pointer, tool);
        return;
      case "polyline": {
        const p = snap(at);
        const points = polyline ?? [];
        const first = points[0];
        if (
          first &&
          points.length > 2 &&
          Math.hypot(p[0] - first[0], p[1] - first[1]) * pointer.camera.zoom < 8
        ) {
          finishPolyline(points, true);
          return;
        }
        if (double) {
          finishPolyline(points);
          return;
        }
        setPolyline([...points, p]);
        return;
      }
      case "text":
        pointer.event.preventDefault();
        setTextEdit({
          id: null,
          at: snap(at),
          text: "",
          sizeMm: settings.textMm,
          color: settings.stroke.color,
        });
        return;
      case "hand":
        return;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!camera || (tool !== "polyline" && tool !== "eraser")) return;
    stageRef.current = (event.target as HTMLElement).closest("[data-testid^='viewport-']");
    if (!stageRef.current) return;
    setHover(toSheet(event, camera));
  };

  // While a polyline is open, Enter finishes it, Backspace removes the last point and
  // Escape cancels it. These keys are taken before the workspace shortcuts see them.
  useEffect(() => {
    if (!polyline) return;
    const handler = (event: KeyboardEvent) => {
      if (!["Enter", "Escape", "Backspace"].includes(event.key)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Enter") finishPolyline(polyline);
      else if (event.key === "Escape") setPolyline(null);
      else setPolyline(polyline.length > 1 ? polyline.slice(0, -1) : null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  });

  // ---------------------------------------------------------------- render

  const polylinePreview =
    polyline && polyline.length > 0
      ? makePolyline(
          hover && tool === "polyline"
            ? [...polyline, snap(hover)]
            : polyline.length > 1
              ? polyline
              : [polyline[0]!, polyline[0]!],
          false,
          settings.stroke,
        )
      : null;

  const overlay = (cam: Camera) => {
    const items = [];
    const bounds = tool === "select" ? unionBounds(selected.map(elementBounds)) : null;
    if (bounds) {
      const tl = contentToScreen(cam, { x: bounds.x, y: bounds.y });
      const pad = 4;
      items.push(
        <div
          key="selection"
          className={local.selection}
          data-testid="element-selection"
          style={{
            left: tl.x - pad,
            top: tl.y - pad,
            width: bounds.w * cam.zoom + pad * 2,
            height: bounds.h * cam.zoom + pad * 2,
          }}
        >
          {CORNERS.map((corner) => (
            <span
              key={corner}
              className={`${local.handle} ${local[corner]}`}
              onPointerDown={(e) => startScale(corner, e, cam)}
              aria-hidden
            />
          ))}
        </div>,
      );
    }
    if (marquee) {
      const tl = contentToScreen(cam, { x: marquee.x, y: marquee.y });
      items.push(
        <div
          key="marquee"
          className={local.marquee}
          style={{
            left: tl.x,
            top: tl.y,
            width: marquee.w * cam.zoom,
            height: marquee.h * cam.zoom,
          }}
        />,
      );
    }
    if (tool === "eraser" && hover) {
      const c = contentToScreen(cam, { x: hover[0], y: hover[1] });
      const r = settings.eraserMm * cam.zoom;
      items.push(
        <div
          key="eraser"
          className={local.eraser}
          style={{ left: c.x - r, top: c.y - r, width: r * 2, height: r * 2 }}
        />,
      );
    }
    if (textEdit) {
      const at = contentToScreen(cam, { x: textEdit.at[0], y: textEdit.at[1] });
      const size = textEdit.sizeMm * cam.zoom;
      items.push(
        <textarea
          key="text"
          className={local.textEditor}
          aria-label={textEdit.id ? "Edit text" : "New text"}
          autoFocus
          value={textEdit.text}
          rows={Math.max(1, textEdit.text.split("\n").length)}
          style={{
            left: at.x,
            top: at.y - size * 0.95,
            fontSize: size,
            color: textEdit.color,
          }}
          onChange={(e) => setTextEdit({ ...textEdit, text: e.target.value })}
          onBlur={() => commitText(textEdit)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") setTextEdit(null);
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitText(textEdit);
            }
          }}
        />,
      );
    }
    return items;
  };

  const cursor =
    tool === "select"
      ? "default"
      : tool === "text"
        ? "text"
        : tool === "eraser"
          ? "none"
          : "crosshair";

  return (
    <div
      className={local.canvasHost}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
    >
      <Viewport
        viewKey={viewKey}
        content={{ width: drawing.sheet.format.widthMm, height: drawing.sheet.format.heightMm }}
        unit="mm"
        label={`Drawing ${drawing.number}`}
        surface="desk"
        rulers={drawing.sheet.rulers}
        mode={tool === "hand" ? "hand" : "tool"}
        cursor={cursor}
        onToolPointerDown={onToolPointerDown}
        overlay={overlay}
      >
        <SheetSvg
          drawing={drawing}
          grid={grid.visible}
          className={local.sheetSvg}
          hiddenIds={textEdit?.id ? new Set([textEdit.id]) : undefined}
        >
          {draft ? <ElementShape element={draft} /> : null}
          {polylinePreview ? <ElementShape element={polylinePreview} /> : null}
        </SheetSvg>
      </Viewport>
    </div>
  );
}
