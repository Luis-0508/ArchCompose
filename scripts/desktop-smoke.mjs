// Desktop smoke test: drives the running Tauri app through WebView2's DevTools
// protocol and exercises the real Rust commands (file read, atomic project save,
// engine status, engine decode and export) plus a full UI flow fed from files on disk.
//
// Windows only. Start the app with remote debugging enabled, then run this script:
//
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
//   npm run tauri dev
//   node scripts/desktop-smoke.mjs
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exit(1);
};
const ok = (message) => console.log(`ok   ${message}`);

const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => /^http:\/\/(localhost:\d+|tauri\.localhost)/.test(p.url()));
if (!page) fail("no ArchCompose page found on the debugging port");
await page.waitForSelector("text=Start with a render");

const invoke = (cmd, args) =>
  page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

const status = await invoke("engine_status");
if (status.engineLinked !== true || !/^[0-9a-f]{40}$/.test(status.engineRevision ?? ""))
  fail(JSON.stringify(status));
ok(
  `engine_status: ${status.renderer}, engine ${status.engineVersion} at ${status.engineRevision.slice(0, 7)}, v${status.appVersion}`,
);

const dir = mkdtempSync(join(tmpdir(), "archcompose-smoke-"));
const projectPath = join(dir, "Smoke test.archcompose");
await invoke("write_project_file", { path: projectPath, contents: '{"hello":"world"}' });
await invoke("write_project_file", { path: projectPath, contents: '{"hello":"again"}' });
const text = await invoke("read_project_file", { path: projectPath });
if (text !== '{"hello":"again"}' || readFileSync(projectPath, "utf8") !== text)
  fail("project round trip");
ok("write_project_file and read_project_file round-trip on disk");

const missing = await invoke("read_file", { path: join(dir, "missing.png") }).catch((e) =>
  String(e),
);
if (!/not found/.test(missing)) fail(`missing file message: ${missing}`);
ok(`read_file reports missing files: ${missing}`);

// A real PNG on disk, drawn by the web view's canvas.
const pngBase64 = await page.evaluate(async () => {
  const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 800 });
  const c = canvas.getContext("2d");
  c.fillStyle = "#8aa0b4";
  c.fillRect(0, 0, 1200, 500);
  c.fillStyle = "#8f8a80";
  c.fillRect(0, 500, 1200, 300);
  c.fillStyle = "#c9c2b5";
  c.fillRect(300, 220, 600, 300);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
});
const pngPath = join(dir, "render.png");
writeFileSync(pngPath, Buffer.from(pngBase64, "base64"));
const length = await page.evaluate(
  async (p) => (await window.__TAURI_INTERNALS__.invoke("read_file", { path: p })).byteLength,
  pngPath,
);
if (length !== readFileSync(pngPath).length) fail(`read_file length ${length}`);
ok(`read_file returns ${length} bytes as binary IPC`);

// Save a project that references the PNG by path, then reopen it through the app's
// own loader: the image must be read from disk by Rust and shown in Compose.
const now = new Date().toISOString();
const project = {
  schemaVersion: 1,
  id: "prj_smoke",
  name: "Desktop smoke test",
  createdAt: now,
  modifiedAt: now,
  assets: {
    ast_render: {
      id: "ast_render",
      name: "render.png",
      kind: "render",
      path: pngPath,
      mime: "image/png",
      byteSize: length,
      width: 1200,
      height: 800,
      addedAt: now,
    },
  },
  assetOrder: ["ast_render"],
  composeDocs: [
    {
      id: "cmp_smoke",
      name: "Smoke view",
      width: 1200,
      height: 800,
      horizonY: 500,
      layers: [
        {
          id: "lyr_base",
          name: "Base render",
          assetId: "ast_render",
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          visible: true,
          locked: true,
        },
      ],
    },
  ],
  // A schema 1 drawing with a file: opening it must migrate it to a sheet with an underlay.
  drawings: [
    {
      id: "drw_smoke",
      number: "A-101",
      title: "Smoke plan",
      kind: "plan",
      scale: 100,
      level: "",
      sourceAssetId: "ast_render",
      revisions: [],
    },
  ],
  boards: [],
};
await invoke("write_project_file", { path: projectPath, contents: JSON.stringify(project) });
await page.evaluate(async (p) => {
  const { loadProjectFromPath } = await import("/src/app/commands.ts");
  await loadProjectFromPath(p);
}, projectPath);
await page.waitForSelector("img[src^='blob:']", { timeout: 10_000 });
const sheet = await page.getByTestId("tb-sheet").textContent();
if (!sheet?.includes("Smoke view")) fail(`title block sheet: ${sheet}`);
ok("opened a saved project from disk; the render was loaded by Rust and displayed");

// A 16-bit baseline TIFF with transparency, which the web view cannot decode.
const tiffPath = join(dir, "cutout.tif");
writeFileSync(tiffPath, tiffRgba16(40, 80, [12000, 40000, 20000, 32768]));
const decoded = await page.evaluate(async (p) => {
  const bytes = await window.__TAURI_INTERNALS__.invoke("engine_decode_preview", { path: p });
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const c = canvas.getContext("2d");
  c.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, px: [...c.getImageData(5, 5, 1, 1).data] };
}, tiffPath);
if (decoded.width !== 40 || decoded.height !== 80 || Math.abs(decoded.px[3] - 128) > 1)
  fail(`engine_decode_preview: ${JSON.stringify(decoded)}`);
ok(
  `engine_decode_preview decodes a 16-bit TIFF: ${decoded.width} × ${decoded.height}, alpha ${decoded.px[3]}`,
);

const corrupt = join(dir, "broken.tif");
writeFileSync(corrupt, Buffer.from("II*\0garbage"));
const corruptMessage = await invoke("engine_decode_preview", { path: corrupt }).catch(String);
if (!/broken\.tif/.test(corruptMessage)) fail(`corrupt TIFF message: ${corruptMessage}`);
ok(`corrupt files are reported: ${corruptMessage}`);

// Place the TIFF as a half-transparent layer through the app, then export with the engine.
const historyBefore = await page.evaluate(async (p) => {
  const { importFiles, placeAssetInCompose } = await import("/src/app/commands.ts");
  const { platform } = await import("/src/platform/index.ts");
  const { useAppStore } = await import("/src/state/store.ts");
  const files = await Promise.all(
    [p].map(async (path) => {
      const blob = await platform.readFile(path, "cutout.tif");
      return { name: "cutout.tif", path, blob, decodedBy: "engine", byteSize: 1 };
    }),
  );
  const [ref] = await importFiles(files, "cutout");
  placeAssetInCompose("cmp_smoke", ref);
  return useAppStore.getState().history.past.length;
}, tiffPath);
const spec = await page.evaluate(async () => {
  const { compositionSpec } = await import("/src/engine/composition.ts");
  const { useAppStore } = await import("/src/state/store.ts");
  const project = useAppStore.getState().history.present;
  const result = compositionSpec(project, project.composeDocs[0], "psd");
  return result.spec;
});
if (spec.layers.length !== 2) fail(`spec layers: ${JSON.stringify(spec)}`);
const exportPath = join(dir, "export.png");
const report = await invoke("engine_export_png", { spec, path: exportPath });
const exported = readFileSync(exportPath);
const ihdr = [exported.readUInt32BE(16), exported.readUInt32BE(20), exported[24], exported[25]];
if (ihdr[0] !== 1200 || ihdr[1] !== 800 || ihdr[2] !== 16 || ihdr[3] !== 6)
  fail(`exported PNG header ${ihdr} ${JSON.stringify(report)}`);
ok(
  `engine_export_png wrote ${ihdr[0]} × ${ihdr[1]} px, ${ihdr[2]}-bit RGBA (${exported.length} bytes)`,
);

const psdPath = join(dir, "export.psd");
await invoke("engine_export_psd", { spec, path: psdPath });
if (readFileSync(psdPath).subarray(0, 4).toString() !== "8BPS") fail("PSD signature");
ok("engine_export_psd wrote a layered PSD");

const original = readFileSync(pngPath);
const refused = await invoke("engine_export_png", { spec, path: pngPath }).catch(String);
if (!/replace/.test(refused) || !readFileSync(pngPath).equals(original))
  fail(`overwrite guard: ${refused}`);
ok(`exports never replace a source image: ${refused}`);

const historyAfter = await page.evaluate(async () => {
  const { useAppStore } = await import("/src/state/store.ts");
  return useAppStore.getState().history.past.length;
});
if (historyAfter !== historyBefore) fail("exporting changed the undo history");
ok("exporting leaves the undo history unchanged");

// Adjustments: the engine renders the canvas preview, exports apply them, and they survive
// saving and reopening the project.
const previewPx = await page.evaluate(async (p) => {
  const bytes = await window.__TAURI_INTERNALS__.invoke("engine_layer_preview", {
    path: p,
    adjust: { exposure: 1, brightness: 0, contrast: 0, saturation: 0 },
    layerScale: 1,
  });
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
  c.drawImage(bitmap, 0, 0);
  return [...c.getImageData(600, 100, 1, 1).data];
}, pngPath);
// Sky #8aa0b4 brightened by one stop.
if (!(previewPx[0] > 0x8a + 20 && previewPx[3] === 255)) fail(`layer preview ${previewPx}`);
ok(`engine_layer_preview applies exposure: sky ${previewPx.slice(0, 3)}`);

const filtered = await page.evaluate(async (p) => {
  const bytes = await window.__TAURI_INTERNALS__.invoke("engine_layer_preview", {
    path: p,
    adjust: {
      exposure: 0,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      vibrance: 30,
      warmth: 40,
      blur: 3,
      sharpen: 50,
    },
    layerScale: 0.5,
  });
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
  c.drawImage(bitmap, 0, 0);
  return [...c.getImageData(600, 100, 1, 1).data];
}, pngPath);
// The sky turns warmer: more red than blue relative to #8aa0b4.
if (!(filtered[0] - filtered[2] > 0x8a - 0xb4 + 10)) fail(`filtered preview ${filtered}`);
ok(`engine_layer_preview applies warmth, vibrance, blur and sharpening: ${filtered.slice(0, 3)}`);

await page.evaluate(async () => {
  const { setLayerAdjustments } = await import("/src/model/compose.ts");
  const { useAppStore } = await import("/src/state/store.ts");
  useAppStore
    .getState()
    .apply("Adjust layer", (p) => setLayerAdjustments(p, "cmp_smoke", "lyr_base", { exposure: 1 }));
});
await page.waitForFunction(
  () =>
    document.querySelectorAll("img[src^='blob:']").length > 0 &&
    [...document.querySelectorAll("img")].some(
      (i) => i.style.left === "0px" && i.naturalWidth === 1200 && i.complete,
    ),
);
const adjustedSpec = await page.evaluate(async () => {
  const { compositionSpec } = await import("/src/engine/composition.ts");
  const { useAppStore } = await import("/src/state/store.ts");
  const project = useAppStore.getState().history.present;
  return compositionSpec(project, project.composeDocs[0], "png").spec;
});
const adjustedPath = join(dir, "adjusted.png");
await invoke("engine_export_png", { spec: adjustedSpec, path: adjustedPath });
const adjustedPx = await page.evaluate(async (p) => {
  const bytes = await window.__TAURI_INTERNALS__.invoke("read_file", { path: p });
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
  c.drawImage(bitmap, 0, 0);
  return [...c.getImageData(600, 100, 1, 1).data];
}, adjustedPath);
if (Math.abs(adjustedPx[0] - previewPx[0]) > 2)
  fail(`export ${adjustedPx} vs preview ${previewPx}`);
ok(`the export matches the engine preview: ${adjustedPx.slice(0, 3)}`);

const savedPath = join(dir, "Adjusted.archcompose");
const savedText = await page.evaluate(async () => {
  const { serializeProject } = await import("/src/model/serialization.ts");
  const { useAppStore } = await import("/src/state/store.ts");
  return serializeProject(useAppStore.getState().history.present);
});
await invoke("write_project_file", { path: savedPath, contents: savedText });
await page.evaluate(async (p) => {
  const { useAppStore } = await import("/src/state/store.ts");
  useAppStore.getState().markSaved(null);
  const { loadProjectFromPath } = await import("/src/app/commands.ts");
  await loadProjectFromPath(p);
}, savedPath);
const reopened = await page.evaluate(async () => {
  const { useAppStore } = await import("/src/state/store.ts");
  const doc = useAppStore.getState().history.present.composeDocs[0];
  return { layers: doc.layers.length, adjust: doc.layers[0].adjust };
});
if (reopened.layers !== 2 || reopened.adjust?.exposure !== 1)
  fail(`reopened ${JSON.stringify(reopened)}`);
await page.waitForFunction(() =>
  document.querySelector("[data-testid='tb-zoom']")?.textContent?.includes("%"),
);
ok("saved and reopened the project with its layers and adjustments; the canvas is shown again");

await page.getByRole("button", { name: "Export PNG" }).waitFor();
if (await page.getByRole("button", { name: "Export PNG" }).isDisabled())
  fail("Export PNG is disabled in the desktop app");
ok("the compose inspector offers Export PNG and Export layered PSD");

// Drawings: the schema 1 drawing became a sheet with the render as underlay. Draw on it,
// save, reopen, and check that the content survived and is displayed.
const migrated = await page.evaluate(async () => {
  const { useAppStore } = await import("/src/state/store.ts");
  const p = useAppStore.getState().history.present;
  return { schema: p.schemaVersion, drawing: p.drawings[0] };
});
if (migrated.schema !== 2 || migrated.drawing?.underlay?.assetId !== "ast_render")
  fail(`migrated drawing ${JSON.stringify(migrated)}`);
ok(
  `the schema 1 drawing opened as a ${migrated.drawing.sheet.format.preset} sheet with an underlay`,
);
await page.evaluate(async () => {
  const { useAppStore } = await import("/src/state/store.ts");
  const { addElements, makeLine, makeText, DEFAULT_STROKE } = await import("/src/model/sheet.ts");
  const store = useAppStore.getState();
  store.apply("Draw line", (p) =>
    addElements(p, "drw_smoke", [
      makeLine([20, 20], [200, 20], DEFAULT_STROKE),
      makeText([20, 40], "Smoke", 6, DEFAULT_STROKE),
    ]),
  );
  store.select({ drawingId: "drw_smoke" });
  store.setWorkspace("drawings");
});
const drawingPath = join(dir, "Drawing.archcompose");
const drawingText = await page.evaluate(async () => {
  const { serializeProject } = await import("/src/model/serialization.ts");
  const { useAppStore } = await import("/src/state/store.ts");
  return serializeProject(useAppStore.getState().history.present);
});
await invoke("write_project_file", { path: drawingPath, contents: drawingText });
await page.evaluate(async (p) => {
  const { useAppStore } = await import("/src/state/store.ts");
  useAppStore.getState().markSaved(null);
  const { loadProjectFromPath } = await import("/src/app/commands.ts");
  await loadProjectFromPath(p);
  useAppStore.getState().setWorkspace("drawings");
}, drawingPath);
await page.waitForSelector("[data-testid='sheet-drw_smoke'] image[href^='blob:']", {
  timeout: 10_000,
});
const shown = await page.locator("[data-testid='sheet-drw_smoke'] [data-element-id]").count();
if (shown !== 2) fail(`reopened drawing shows ${shown} elements`);
ok("drew on the sheet, saved, reopened: the underlay and both elements are displayed");

await page.screenshot({ path: join(dir, "desktop.png") });
ok(`screenshot: ${join(dir, "desktop.png")}`);
await browser.close();
console.log("Desktop smoke test passed.");

/** A little-endian baseline TIFF, RGBA with unassociated alpha, 16 bits per sample. */
function tiffRgba16(width, height, rgba) {
  const entries = [
    [256, 3, 1, width],
    [257, 3, 1, height],
    [258, 3, 4, 0], // BitsPerSample -> offset
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, 0], // StripOffsets -> data
    [277, 3, 1, 4],
    [278, 3, 1, height],
    [279, 4, 1, width * height * 8],
    [284, 3, 1, 1],
    [338, 3, 1, 2],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const bitsAt = 8 + ifdSize;
  const dataAt = bitsAt + 8;
  const buf = Buffer.alloc(dataAt + width * height * 8);
  buf.write("II", 0);
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4);
  buf.writeUInt16LE(entries.length, 8);
  entries.forEach(([tag, type, count, value], i) => {
    const at = 10 + i * 12;
    buf.writeUInt16LE(tag, at);
    buf.writeUInt16LE(type, at + 2);
    buf.writeUInt32LE(count, at + 4);
    const v = tag === 258 ? bitsAt : tag === 273 ? dataAt : value;
    if (type === 3 && count === 1) buf.writeUInt16LE(v, at + 8);
    else buf.writeUInt32LE(v, at + 8);
  });
  for (let i = 0; i < 4; i++) buf.writeUInt16LE(16, bitsAt + i * 2);
  for (let p = 0; p < width * height; p++) {
    rgba.forEach((v, c) => buf.writeUInt16LE(v, dataAt + p * 8 + c * 2));
  }
  return buf;
}
