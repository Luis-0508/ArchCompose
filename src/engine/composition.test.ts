import { describe, expect, it } from "vitest";
import { addLayer, createComposeDoc, setLayerAdjustments, updateLayer } from "../model/compose";
import { addAsset, createProject } from "../model/project";
import type { AssetRef, Project } from "../model/types";
import { compositionSpec, describeExport } from "./composition";

function setup(withPaths = true) {
  let project: Project = createProject();
  const add = (name: string, path: string | undefined, width: number, height: number) => {
    const [next, ref] = addAsset(project, {
      name,
      kind: "render",
      path,
      mime: "image/png",
      byteSize: 10,
      width,
      height,
    });
    project = next;
    return ref;
  };
  const base: AssetRef = add("Base.png", withPaths ? "C:/renders/Base.png" : undefined, 800, 600);
  const tree: AssetRef = add("Tree.png", "C:/cutouts/Tree.png", 200, 400);
  const [withDoc, doc] = createComposeDoc(project, base);
  const [withLayer, layerId] = addLayer(withDoc, doc.id, tree);
  return { project: withLayer, docId: doc.id, layerId: layerId! };
}

describe("composition spec", () => {
  it("lists layers bottom to top with their files and placement", () => {
    const { project, docId, layerId } = setup();
    const moved = updateLayer(project, docId, layerId, {
      x: 12.5,
      y: 40,
      scale: 0.5,
      opacity: 0.8,
    });
    const doc = moved.composeDocs[0]!;
    const result = compositionSpec(moved, doc, "png");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec).toMatchObject({ width: 800, height: 600 });
    expect(result.spec.layers.map((l) => l.path)).toEqual([
      "C:/renders/Base.png",
      "C:/cutouts/Tree.png",
    ]);
    expect(result.spec.layers[1]).toMatchObject({ x: 12.5, y: 40, scale: 0.5, opacity: 0.8 });
  });

  it("leaves hidden layers out of a PNG but keeps them in a PSD", () => {
    const { project, docId, layerId } = setup();
    const hidden = updateLayer(project, docId, layerId, { visible: false });
    const doc = hidden.composeDocs[0]!;
    const png = compositionSpec(hidden, doc, "png");
    const psd = compositionSpec(hidden, doc, "psd");
    expect(png.ok && png.spec.layers.length).toBe(1);
    expect(psd.ok && psd.spec.layers.map((l) => l.visible)).toEqual([true, false]);
  });

  it("passes adjustments only for adjusted layers", () => {
    const { project, docId, layerId } = setup();
    const adjusted = setLayerAdjustments(project, docId, layerId, { exposure: 1 });
    const result = compositionSpec(adjusted, adjusted.composeDocs[0]!, "png");
    expect(result.ok && result.spec.layers.map((l) => l.adjust?.exposure)).toEqual([undefined, 1]);
  });

  it("explains layers without a file on disk", () => {
    const { project } = setup(false);
    const result = compositionSpec(project, project.composeDocs[0]!, "png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Base\.png.*browser session/);
  });

  it("refuses to export when every layer is hidden", () => {
    const { project, docId } = setup();
    let next = project;
    for (const layer of project.composeDocs[0]!.layers) {
      next = updateLayer(next, docId, layer.id, { visible: false });
    }
    const result = compositionSpec(next, next.composeDocs[0]!, "psd");
    expect(result.ok).toBe(false);
  });

  it("describes the result", () => {
    const report = { width: 800, height: 600, bitDepth: 16, layers: 2, bytes: 1 };
    expect(describeExport(report, "png")).toBe("Exported a 800 × 600 px 16-bit PNG.");
    expect(describeExport(report, "psd")).toBe("Exported a 800 × 600 px 16-bit PSD, 2 layers.");
  });
});
