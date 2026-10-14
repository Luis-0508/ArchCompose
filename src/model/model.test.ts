import { describe, expect, it } from "vitest";
import {
  addBoard,
  addFrame,
  cellAt,
  effectiveDpi,
  findFreeCell,
  formatFor,
  frameRect,
  setGrid,
  updateFrame,
} from "./boards";
import {
  addLayer,
  createComposeDoc,
  hasAdjustments,
  reorderLayer,
  setLayerAdjustments,
  updateLayer,
} from "./compose";
import {
  addDrawing,
  addRevision,
  nextRevisionCode,
  nextSheetNumber,
  scaleBarStep,
} from "./drawings";
import { commit, commitFrom, createHistory, redo, replacePresent, undo } from "./history";
import { addAsset, assetUsage, createProject, removeAsset, type NewAsset } from "./project";
import { parseProject, ProjectFileError, serializeProject } from "./serialization";
import { validateBoard } from "./validation";

const render: NewAsset = {
  name: "courtyard-dusk.jpg",
  kind: "render",
  mime: "image/jpeg",
  byteSize: 1000,
  width: 4000,
  height: 2250,
};
const person: NewAsset = {
  ...render,
  name: "person.png",
  kind: "cutout",
  width: 400,
  height: 1200,
};

function projectWithComposeDoc() {
  const [p1, base] = addAsset(createProject(), render);
  const [p2, cutout] = addAsset(p1, person);
  const [p3, doc] = createComposeDoc(p2, base);
  return { project: p3, base, cutout, doc };
}

describe("compose documents", () => {
  it("sizes the document to the base render and locks the base layer", () => {
    const { doc } = projectWithComposeDoc();
    expect(doc.width).toBe(4000);
    expect(doc.height).toBe(2250);
    expect(doc.name).toBe("courtyard-dusk");
    expect(doc.layers[0]?.locked).toBe(true);
  });

  it("places cut-outs centred at a quarter of the canvas height", () => {
    const { project, cutout, doc } = projectWithComposeDoc();
    const [next, layerId] = addLayer(project, doc.id, cutout);
    const layer = next.composeDocs[0]!.layers.find((l) => l.id === layerId)!;
    expect(layer.scale * cutout.height).toBeCloseTo(2250 / 4);
    expect(layer.x + (cutout.width * layer.scale) / 2).toBeCloseTo(2000, 0);
  });

  it("clamps scale and opacity and reorders layers", () => {
    const { project, cutout, doc } = projectWithComposeDoc();
    const [p1, layerId] = addLayer(project, doc.id, cutout);
    const p2 = updateLayer(p1, doc.id, layerId!, { scale: -4, opacity: 3 });
    const layer = p2.composeDocs[0]!.layers[1]!;
    expect(layer.scale).toBe(0.01);
    expect(layer.opacity).toBe(1);
    const p3 = reorderLayer(p2, doc.id, layerId!, -1);
    expect(p3.composeDocs[0]!.layers[0]!.id).toBe(layerId);
    expect(reorderLayer(p3, doc.id, layerId!, -1)).toEqual(p3);
  });

  it("stores clamped adjustments and drops neutral ones", () => {
    const { project, doc } = projectWithComposeDoc();
    const layerId = doc.layers[0]!.id;
    const p1 = setLayerAdjustments(project, doc.id, layerId, { exposure: 9, saturation: -20 });
    const adjusted = p1.composeDocs[0]!.layers[0]!;
    expect(adjusted.adjust).toEqual({ exposure: 5, brightness: 0, contrast: 0, saturation: -20 });
    expect(hasAdjustments(adjusted)).toBe(true);
    const p2 = setLayerAdjustments(p1, doc.id, layerId, { contrast: Number.NaN, exposure: 0 });
    expect(p2.composeDocs[0]!.layers[0]!.adjust).toEqual({
      exposure: 0,
      brightness: 0,
      contrast: 0,
      saturation: -20,
    });
    const reset = setLayerAdjustments(p2, doc.id, layerId, null);
    expect(reset.composeDocs[0]!.layers[0]!).not.toHaveProperty("adjust");
    expect(project.composeDocs[0]!.layers[0]!).not.toHaveProperty("adjust");
  });

  it("round-trips adjustments through the project file and rejects malformed ones", () => {
    const { project, doc } = projectWithComposeDoc();
    const adjusted = setLayerAdjustments(project, doc.id, doc.layers[0]!.id, { brightness: 30 });
    const reopened = parseProject(serializeProject(adjusted));
    expect(reopened.composeDocs[0]!.layers[0]!.adjust?.brightness).toBe(30);
    const broken = serializeProject(adjusted).replace('"brightness": 30', '"brightness": "high"');
    expect(() => parseProject(broken)).toThrow(/malformed adjustments/);
  });

  it("removes every reference when an asset is removed", () => {
    const { project, cutout, doc } = projectWithComposeDoc();
    const [p1] = addLayer(project, doc.id, cutout);
    const [p2, board] = addBoard(p1);
    const [p3] = addFrame(
      p2,
      board.id,
      { type: "asset", assetId: cutout.id, fit: "cover" },
      { col: 0, row: 0 },
    );
    expect(assetUsage(p3, cutout.id)).toBe(2);
    const p4 = removeAsset(p3, cutout.id);
    expect(assetUsage(p4, cutout.id)).toBe(0);
    expect(p4.boards[0]!.frames[0]!.content.type).toBe("empty");
    expect(p4.assetOrder).not.toContain(cutout.id);
  });
});

describe("drawings", () => {
  it("numbers sheets per series and skips used numbers", () => {
    const [p1] = addDrawing(createProject(), "plan");
    const [p2] = addDrawing(p1, "plan");
    const [p3] = addDrawing(p2, "section");
    expect(p3.drawings.map((d) => d.number)).toEqual(["A-101", "A-102", "A-201"]);
    expect(nextSheetNumber(p3.drawings, "plan")).toBe("A-103");
  });

  it("continues revision codes", () => {
    expect(nextRevisionCode([])).toBe("P01");
    expect(nextRevisionCode([{ code: "P09", date: "", note: "" }])).toBe("P10");
    const [p1, drawing] = addDrawing(createProject(), "elevation");
    const p2 = addRevision(addRevision(p1, drawing.id, "Issued"), drawing.id, "Window update");
    expect(p2.drawings[0]!.revisions.map((r) => r.code)).toEqual(["P01", "P02"]);
  });

  it("picks round scale bar steps", () => {
    expect(scaleBarStep(100)).toEqual({ metres: 2, paperMm: 20 });
    expect(scaleBarStep(50).metres).toBe(1);
    expect(scaleBarStep(500).metres).toBe(10);
  });
});

describe("boards", () => {
  it("applies orientation to ISO sizes", () => {
    expect(formatFor("A1", "landscape")).toMatchObject({ widthMm: 841, heightMm: 594 });
    expect(formatFor("A0", "portrait")).toMatchObject({ widthMm: 841, heightMm: 1189 });
    expect(formatFor("custom", "portrait", { widthMm: 1200, heightMm: 800 }).orientation).toBe(
      "landscape",
    );
  });

  it("computes frame rectangles from the grid", () => {
    const [, board] = addBoard(createProject());
    // A1 landscape, 6 × 4, 20 mm margin, 8 mm gutter.
    const cellW = (841 - 40 - 5 * 8) / 6;
    const rect = frameRect(board, {
      id: "f",
      col: 1,
      row: 0,
      colSpan: 2,
      rowSpan: 1,
      content: { type: "empty" },
    });
    expect(rect.x).toBeCloseTo(20 + cellW + 8);
    expect(rect.w).toBeCloseTo(2 * cellW + 8);
    expect(cellAt(board, rect.x + 1, rect.y + 1)).toEqual({ col: 1, row: 0 });
  });

  it("keeps frames inside the grid when it shrinks", () => {
    const [p1, board] = addBoard(createProject());
    const [p2, frameId] = addFrame(p1, board.id, { type: "empty" }, { col: 4, row: 3, colSpan: 2 });
    const p3 = setGrid(p2, board.id, { columns: 3, rows: 2 });
    const frame = p3.boards[0]!.frames.find((f) => f.id === frameId)!;
    expect(frame).toMatchObject({ col: 1, row: 1, colSpan: 2 });
    const p4 = updateFrame(p3, board.id, frameId!, { colSpan: 10 });
    expect(p4.boards[0]!.frames[0]).toMatchObject({ col: 0, colSpan: 3 });
  });

  it("finds the next free cell", () => {
    const [p1, board] = addBoard(createProject());
    const [p2] = addFrame(p1, board.id, { type: "empty" }, { col: 0, row: 0, colSpan: 2 });
    expect(findFreeCell(p2.boards[0]!)).toEqual({ col: 2, row: 0 });
    expect(findFreeCell(p2.boards[0]!, 6, 1)).toEqual({ col: 0, row: 1 });
  });

  it("computes effective resolution for cover and contain", () => {
    // 4000 × 2000 px into a 254 × 254 mm frame: 400 dpi across, 200 dpi down.
    expect(effectiveDpi(4000, 2000, 254, 254, "cover")).toBeCloseTo(200);
    expect(effectiveDpi(4000, 2000, 254, 254, "contain")).toBeCloseTo(400);
    expect(effectiveDpi(0, 2000, 254, 254, "cover")).toBe(0);
  });

  it("reports low resolution, missing files and overlaps", () => {
    const [p0, asset] = addAsset(createProject(), { ...render, width: 800, height: 450 });
    const [p1, board] = addBoard(p0);
    const [p2] = addFrame(
      p1,
      board.id,
      { type: "asset", assetId: asset.id, fit: "cover" },
      { col: 0, row: 0, colSpan: 6, rowSpan: 4 },
    );
    const [p3] = addFrame(
      p2,
      board.id,
      { type: "text", role: "title", text: "" },
      { col: 0, row: 0 },
    );
    const issues = validateBoard(p3, p3.boards[0]!, { isAssetAvailable: () => false });
    const messages = issues.map((i) => `${i.severity}: ${i.message}`);
    expect(messages.some((m) => m.startsWith("error:") && m.includes("dpi"))).toBe(true);
    expect(messages.some((m) => m.includes("cannot be loaded"))).toBe(true);
    expect(messages.some((m) => m.includes("overlaps"))).toBe(true);
    expect(messages.some((m) => m.includes("Text frame is empty"))).toBe(true);
    expect(issues[0]!.severity).toBe("error");
  });
});

describe("history", () => {
  it("undoes and redoes with labels", () => {
    let h = createHistory(1);
    h = commit(h, 2, "Two");
    h = commit(h, 3, "Three");
    h = undo(h);
    expect(h.present).toBe(2);
    expect(h.future[0]?.label).toBe("Three");
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    h = commit(h, 9, "Nine");
    expect(h.future).toHaveLength(0);
    expect(h.past.map((e) => e.label)).toEqual(["Nine"]);
  });

  it("collapses a gesture into one step", () => {
    let h = createHistory(0);
    const base = h.present;
    for (let i = 1; i <= 10; i++) h = replacePresent(h, i);
    h = commitFrom(h, base, "Drag");
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe(0);
  });

  it("ignores no-op commits", () => {
    const h = createHistory({ a: 1 });
    expect(commit(h, h.present, "Nothing")).toBe(h);
  });
});

describe("serialization", () => {
  it("round-trips a project", () => {
    const { project } = projectWithComposeDoc();
    const parsed = parseProject(serializeProject(project, new Date("2026-01-01T00:00:00Z")));
    expect(parsed.composeDocs[0]!.layers).toEqual(project.composeDocs[0]!.layers);
    expect(parsed.modifiedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects malformed and future files with clear messages", () => {
    expect(() => parseProject("not json")).toThrow(ProjectFileError);
    expect(() => parseProject(JSON.stringify({ schemaVersion: 99 }))).toThrow(/newer version/);
    const broken = JSON.parse(serializeProject(createProject())) as Record<string, unknown>;
    broken.assetOrder = ["ast_missing"];
    expect(() => parseProject(JSON.stringify(broken))).toThrow(/unknown asset/);
  });
});
