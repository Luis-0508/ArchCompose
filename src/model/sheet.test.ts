import { describe, expect, it } from "vitest";
import { formatFor } from "./boards";
import { addDrawing } from "./drawings";
import { addAsset, createProject, removeAsset } from "./project";
import { parseProject, serializeProject } from "./serialization";
import {
  addElements,
  arrangeElements,
  constrainAngle,
  DEFAULT_STROKE,
  elementBounds,
  elementLength,
  elementsInRect,
  eraseElements,
  fitUnderlay,
  formatReal,
  hitTestElements,
  makeCircle,
  makeLine,
  makePath,
  makePolyline,
  makeRect,
  makeText,
  paperToReal,
  realToPaper,
  removeElements,
  setElementStroke,
  setSheet,
  setSheetFormat,
  setUnderlay,
  simplifyPath,
  snapToGrid,
  transformElement,
  underlaySizeMm,
} from "./sheet";
import type { DrawingElement, SheetPoint } from "./types";

const ink = DEFAULT_STROKE;

function projectWithDrawing() {
  const [project, drawing] = addDrawing(createProject(), "plan");
  return { project, drawing };
}

describe("drawing sheets", () => {
  it("creates a blank A3 landscape sheet with a grid and no image", () => {
    const { drawing } = projectWithDrawing();
    expect(drawing.sheet.format).toEqual(formatFor("A3", "landscape"));
    expect(drawing.sheet.grid).toEqual({ visible: true, spacingMm: 10, snap: false });
    expect(drawing.underlay).toBeNull();
    expect(drawing.elements).toEqual([]);
  });

  it("changes paper format and grid without touching content", () => {
    const { project, drawing } = projectWithDrawing();
    const line = makeLine([10, 10], [50, 10], ink);
    let p = addElements(project, drawing.id, [line]);
    p = setSheetFormat(p, drawing.id, formatFor("A0", "portrait"));
    p = setSheet(p, drawing.id, { grid: { spacingMm: 0, snap: true }, unit: "cm" });
    const d = p.drawings[0]!;
    expect(d.sheet.format.widthMm).toBe(841);
    expect(d.sheet.format.heightMm).toBe(1189);
    expect(d.sheet.grid).toEqual({ visible: true, spacingMm: 1, snap: true });
    expect(d.sheet.unit).toBe("cm");
    expect(d.elements).toEqual([line]);
  });

  it("keeps paper size, scale and image resolution separate", () => {
    expect(paperToReal(10, 100, "m")).toBe(1);
    expect(realToPaper(1, 100, "m")).toBe(10);
    expect(paperToReal(10, 50, "cm")).toBe(50);
    expect(formatReal(25, 100, "m")).toBe("2.50 m");
    // 3000 px at 300 dpi is 10 inches on paper, whatever the drawing scale.
    expect(underlaySizeMm({ width: 3000, height: 1500 }, 300)).toEqual({ w: 254, h: 127 });
  });

  it("fits an image underlay into the sheet and centres it", () => {
    const format = formatFor("A3", "landscape");
    const u = fitUnderlay(format, { id: "ast_1", width: 4200, height: 1000 }, 10);
    const size = underlaySizeMm({ width: 4200, height: 1000 }, u.dpi);
    expect(size.w).toBeCloseTo(400, 0);
    expect(u.xMm).toBeCloseTo(10, 0);
    expect(u.yMm + size.h / 2).toBeCloseTo(format.heightMm / 2, 0);
  });

  it("clamps underlay resolution and drops the underlay with its asset", () => {
    const [p1, asset] = addAsset(createProject(), {
      name: "plan.png",
      kind: "drawing",
      mime: "image/png",
      byteSize: 10,
      width: 1000,
      height: 800,
    });
    const [p2, drawing] = addDrawing(p1, "plan", {
      underlay: fitUnderlay(formatFor("A3", "landscape"), asset),
    });
    const p3 = setUnderlay(p2, drawing.id, { ...drawing.underlay!, dpi: 0, opacity: 3 });
    expect(p3.drawings[0]!.underlay).toMatchObject({ dpi: 10, opacity: 1 });
    expect(removeAsset(p3, asset.id).drawings[0]!.underlay).toBeNull();
  });
});

describe("drawing elements", () => {
  it("adds, restyles, reorders and removes elements", () => {
    const { project, drawing } = projectWithDrawing();
    const a = makeRect([0, 0], [10, 10], ink);
    const b = makeCircle([20, 20], 5, ink);
    let p = addElements(project, drawing.id, [a, b]);
    p = setElementStroke(p, drawing.id, [a.id], { color: "#FF0000", widthMm: 100, opacity: -1 });
    expect(p.drawings[0]!.elements[0]!.stroke).toEqual({
      color: "#ff0000",
      widthMm: 20,
      opacity: 0,
    });
    p = arrangeElements(p, drawing.id, [a.id], 1);
    expect(p.drawings[0]!.elements.map((e) => e.id)).toEqual([b.id, a.id]);
    p = removeElements(p, drawing.id, [b.id]);
    expect(p.drawings[0]!.elements.map((e) => e.id)).toEqual([a.id]);
  });

  it("normalizes rectangles drawn in any direction", () => {
    const r = makeRect([30, 40], [10, 5], ink);
    expect(elementBounds(r)).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });

  it("measures outline length", () => {
    expect(elementLength(makeLine([0, 0], [3, 4], ink))).toBe(5);
    expect(elementLength(makeRect([0, 0], [10, 5], ink))).toBe(30);
    expect(elementLength(makeCircle([0, 0], 10, ink))).toBeCloseTo(Math.PI * 20, 0);
    expect(elementLength(makeText([0, 0], "A", 5, ink))).toBe(0);
  });

  it("moves and scales every element type", () => {
    const t = { sx: 2, sy: 3, dx: 1, dy: 0, ox: 0, oy: 0 };
    const line = transformElement(makeLine([1, 1], [2, 2], ink), t) as Extract<
      DrawingElement,
      { type: "line" }
    >;
    expect([line.from, line.to]).toEqual([
      [3, 3],
      [5, 6],
    ]);
    const ellipse = transformElement(makeCircle([10, 10], 2, ink), t);
    expect(elementBounds(ellipse)).toEqual({ x: 17, y: 24, w: 8, h: 12 });
    const text = transformElement(makeText([0, 10], "Hall", 4, ink), t);
    expect(text).toMatchObject({ x: 1, y: 30, sizeMm: 12 });
    const flipped = transformElement(makeRect([0, 0], [10, 10], ink), {
      ...t,
      sx: -1,
      sy: 1,
      dx: 0,
    });
    expect(elementBounds(flipped)).toEqual({ x: -10, y: 0, w: 10, h: 10 });
  });

  it("hit tests the topmost element near its ink", () => {
    const below = makeRect([0, 0], [20, 20], ink);
    const above = makeLine([0, 10], [20, 10], ink);
    const elements = [below, above];
    expect(hitTestElements(elements, [10, 10.5], 1)?.id).toBe(above.id);
    expect(hitTestElements(elements, [0.2, 5], 1)?.id).toBe(below.id);
    // Rectangles are outlines: the empty middle is not a hit.
    expect(hitTestElements(elements, [10, 4], 1)).toBeNull();
    expect(hitTestElements([makeText([0, 10], "Hall", 5, ink)], [3, 8], 0.5)).not.toBeNull();
  });

  it("selects elements inside a rectangle", () => {
    const inside = makeLine([1, 1], [5, 5], ink);
    const crossing = makeLine([1, 1], [50, 5], ink);
    expect(elementsInRect([inside, crossing], { x: 0, y: 0, w: 10, h: 10 })).toEqual([inside.id]);
  });

  it("snaps to the grid and constrains angles", () => {
    expect(snapToGrid([12.4, 17.6], 5)).toEqual([10, 20]);
    const p = constrainAngle([0, 0], [10, 1]);
    expect(p[0]).toBeCloseTo(Math.hypot(10, 1));
    expect(p[1]).toBeCloseTo(0);
  });

  it("simplifies freehand strokes", () => {
    const points: SheetPoint[] = Array.from({ length: 50 }, (_, i) => [i, i % 2 ? 0.001 : 0]);
    expect(simplifyPath(points, 0.05)).toEqual([
      [0, 0],
      [49, 0.001],
    ]);
  });
});

describe("eraser", () => {
  it("cuts a line in two where the eraser crosses it", () => {
    const line = makeLine([0, 0], [100, 0], { ...ink, widthMm: 0.5 });
    const out = eraseElements(
      [line],
      [
        [50, -5],
        [50, 5],
      ],
      2,
    );
    expect(out).toHaveLength(2);
    const [left, right] = out.map(elementBounds);
    expect(left!.x).toBe(0);
    expect(left!.x + left!.w).toBeLessThan(48);
    expect(right!.x).toBeGreaterThan(52);
    expect(right!.x + right!.w).toBe(100);
    expect(out.every((e) => e.stroke.widthMm === 0.5)).toBe(true);
  });

  it("opens a rectangle into one polyline when one side is cut", () => {
    const rect = makeRect([0, 0], [20, 20], ink);
    const out = eraseElements(
      [rect],
      [
        [10, -2],
        [10, 2],
      ],
      1,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("polyline");
    expect(elementLength(out[0]!)).toBeGreaterThan(70);
  });

  it("removes elements completely under the eraser and leaves others untouched", () => {
    const small = makePath(
      [
        [0, 0],
        [1, 0],
      ],
      ink,
    );
    const far = makePolyline(
      [
        [50, 50],
        [60, 60],
      ],
      false,
      ink,
    );
    const text = makeText([0, 0], "Note", 5, ink);
    const out = eraseElements(
      [small, far, text],
      [
        [0, 0],
        [1, 0],
      ],
      3,
    );
    expect(out).toEqual([far, text]);
  });
});

describe("schema migration", () => {
  it("opens version 1 projects, turning drawing files into underlays and extending adjustments", () => {
    const v1 = {
      schemaVersion: 1,
      id: "prj_1",
      name: "Old",
      createdAt: "2026-01-01T00:00:00Z",
      modifiedAt: "2026-01-01T00:00:00Z",
      assets: {
        ast_1: {
          id: "ast_1",
          name: "plan.png",
          kind: "drawing",
          mime: "image/png",
          byteSize: 1,
          width: 800,
          height: 1200,
          addedAt: "2026-01-01T00:00:00Z",
        },
      },
      assetOrder: ["ast_1"],
      composeDocs: [
        {
          id: "cmp_1",
          name: "View",
          width: 10,
          height: 10,
          horizonY: null,
          layers: [
            {
              id: "lyr_1",
              name: "Base",
              assetId: "ast_1",
              x: 0,
              y: 0,
              scale: 1,
              opacity: 1,
              visible: true,
              locked: false,
              adjust: { exposure: 1, brightness: 0, contrast: 0, saturation: 0 },
            },
          ],
        },
      ],
      drawings: [
        {
          id: "drw_1",
          number: "A-101",
          title: "Plan",
          kind: "plan",
          scale: 100,
          level: "",
          sourceAssetId: "ast_1",
          revisions: [],
        },
        {
          id: "drw_2",
          number: "A-102",
          title: "Empty",
          kind: "plan",
          scale: 100,
          level: "",
          sourceAssetId: null,
          revisions: [],
        },
      ],
      boards: [],
    };
    const project = parseProject(JSON.stringify(v1));
    expect(project.schemaVersion).toBe(2);
    const [withFile, empty] = project.drawings;
    expect(withFile!.sheet.format).toEqual(formatFor("A1", "portrait"));
    expect(withFile!.underlay?.assetId).toBe("ast_1");
    expect(withFile!.elements).toEqual([]);
    expect("sourceAssetId" in withFile!).toBe(false);
    expect(empty!.underlay).toBeNull();
    expect(empty!.sheet.format).toEqual(formatFor("A3", "landscape"));
    // Adjustments gain neutral blur and sharpening.
    expect(project.composeDocs[0]!.layers[0]!.adjust).toEqual({
      exposure: 1,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      blur: 0,
      sharpen: 0,
    });
  });

  it("round-trips drawing content", () => {
    const { project, drawing } = projectWithDrawing();
    const elements = [
      makePath(
        [
          [0, 0],
          [1, 2],
          [3, 1],
        ],
        ink,
      ),
      makeLine([0, 0], [5, 5], ink),
      makePolyline(
        [
          [0, 0],
          [5, 0],
          [5, 5],
        ],
        true,
        ink,
      ),
      makeRect([1, 1], [4, 4], ink),
      makeCircle([10, 10], 3, ink),
      makeText([20, 20], "Living\nroom", 3.5, ink),
    ];
    const p = addElements(project, drawing.id, elements);
    expect(parseProject(serializeProject(p)).drawings[0]!.elements).toEqual(elements);
  });

  it("rejects malformed elements", () => {
    const { project, drawing } = projectWithDrawing();
    const p = addElements(project, drawing.id, [makeLine([0, 0], [1, 1], ink)]);
    const data = JSON.parse(serializeProject(p)) as { drawings: { elements: unknown[] }[] };
    data.drawings[0]!.elements[0] = {
      id: "el_x",
      type: "line",
      stroke: ink,
      from: [0, "a"],
      to: [1, 1],
    };
    expect(() => parseProject(JSON.stringify(data))).toThrow(/malformed element/);
  });
});
