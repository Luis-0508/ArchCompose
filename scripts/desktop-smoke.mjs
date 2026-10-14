// Desktop smoke test: drives the running Tauri app through WebView2's DevTools
// protocol and exercises the real Rust commands (file read, atomic project save,
// engine status) plus a full UI flow fed from a file on disk.
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
  .find((p) => p.url().includes("localhost:1420") || p.url().startsWith("http://tauri.localhost"));
if (!page) fail("no ArchCompose page found on the debugging port");
await page.waitForSelector("text=Start with a render");

const invoke = (cmd, args) =>
  page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

const status = await invoke("engine_status");
if (status.renderer !== "Web view preview" || status.engineLinked !== false)
  fail(JSON.stringify(status));
ok(
  `engine_status: ${status.renderer}, engine linked: ${status.engineLinked}, v${status.appVersion}`,
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
  drawings: [],
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

await page.screenshot({ path: join(dir, "desktop.png") });
ok(`screenshot: ${join(dir, "desktop.png")}`);
await browser.close();
console.log("Desktop smoke test passed.");
