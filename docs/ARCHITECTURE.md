# Architecture

ArchCompose is a Tauri 2 desktop application. The interface is React and TypeScript,
rendered by the system web view (WebView2 on Windows). The Rust backend owns file access
and the image engine, which is built on crates of PhotoCraft (see [UPSTREAM.md](UPSTREAM.md)).

```text
┌──────────────────────────── web view (TypeScript) ────────────────────────────┐
│ workspaces/ compose · drawings · boards     ui/ design system   viewport/     │
│        │ read state, dispatch edits              ▲                            │
│        ▼                                         │                            │
│ state/store.ts (zustand) ── history ──► model/ (pure document model + tests)  │
│        │                                                                      │
│ app/commands.ts ─► platform/ (desktop │ browser)   engine/ (capabilities,     │
│                       │                             preview, composition spec)│
└───────────────────────┼───────────────────────────────────────────────────────┘
                        │ Tauri IPC (invoke)
┌───────────────────────▼──────────── Rust ─────────────────────────────────────┐
│ src-tauri/src/lib.rs  commands: read_file, file_size, read_project_file,      │
│                       write_project_file, engine_status,                      │
│                       engine_decode_preview,                                  │
│                       engine_layer_preview, engine_export_png/psd             │
│ src-tauri/core        files.rs (validated, atomic file I/O)                   │
│                       engine/ (adapter over the PhotoCraft crates)            │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Modules and their rules

| Module            | Responsibility                                                                                                                         | May depend on                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/model/`      | The document model: types, pure update functions, board geometry, validation, undo history, (de)serialization.                         | Nothing outside `model/`. No React, DOM, Tauri.                                |
| `src/state/`      | The application store (document history, selection, view cameras, notices) and the runtime asset cache (object URLs for asset pixels). | `model/`, `viewport/camera`, `platform/` (asset cache only).                   |
| `src/app/`        | Shell (top bar, title block, dialogs), global shortcuts, and `commands.ts`: workflows that combine platform, engine and store.         | Everything below.                                                              |
| `src/workspaces/` | Compose, Drawings and Boards. Read the store, dispatch model functions, render with `ui/` and `viewport/`.                             | `app/commands`, `state/`, `model/`, `ui/`, `viewport/`, `engine/capabilities`. |
| `src/ui/`         | The design system: buttons, fields, choice controls, panels, tooltips, overlays, icons.                                                | `state/` only for overlay components bound to the store.                       |
| `src/viewport/`   | Camera math and the shared zoom/pan viewport with rulers.                                                                              | `state/`.                                                                      |
| `src/platform/`   | Host abstraction. `desktop.ts` calls Tauri; `browser.ts` uses web APIs for development and tests.                                      | `engine/preview` (MIME types), `model/serialization` (extension).              |
| `src/engine/`     | The engine boundary on the frontend: the capability registry, preview formats, and the composition spec sent to the engine.            | `model/` (types and pure helpers).                                             |
| `src-tauri/core`  | Tauri-free backend logic, unit tested: file access and the engine adapter (`engine/`).                                                 | `serde`; PhotoCraft crates in `engine/` only.                                  |
| `src-tauri/src`   | Window setup and IPC command wiring only.                                                                                              | `archcompose-core`, Tauri.                                                     |

## Key decisions

**Document model independent of views.** Every edit is a pure function
`(Project, …) → Project` in `src/model/`. Components never mutate state. This keeps the
model testable without a browser and lets a future engine or CLI reuse the same rules.

**Snapshot undo.** `model/history.ts` keeps past and future project snapshots. Because
updates share unchanged branches, a snapshot costs little. Pointer gestures (dragging a
layer, scrubbing a field, moving a frame) call `beginGesture`, apply transient updates, and
commit one labelled step at `endGesture`. Every undo step has a human-readable label shown
in the undo button tooltip. History is capped at 200 steps.

**Pixels are not in the project.** A project file (`.archcompose`, JSON, schema version 2)
references assets by absolute path. Pixel data lives in `state/assetCache.ts` as object
URLs; on open, the cache reloads each asset through the platform and marks missing files,
which the library, canvas and submission check then show.

**Careful file handling.** The Rust side validates paths (exists, is a file, size limits:
512 MB images, 64 MB projects) and returns sentences the UI shows verbatim. Projects are
written to a temporary file in the same folder, flushed, and renamed over the target, so a
failure never leaves a truncated project. Parsing validates the structure and rejects files
from newer schema versions with an explicit message. Older versions are upgraded step by step
in `model/migrations.ts` before validation. The app asks before discarding unsaved
changes, including when the window is closed.

**Drawing sheets are vector data in paper millimetres.** A drawing has a sheet (paper format,
grid, snapping, rulers, real-world unit), an optional image underlay placed at a resolution in
dpi, and a list of elements (`path`, `line`, `polyline`, `rect`, `ellipse`, `text`) with a
stroke colour, width in millimetres and opacity. `model/sheet.ts` holds the pure geometry:
hit testing, bounds, transforms, snapping and the eraser, which cuts strokes into pieces.
The canvas (`workspaces/drawings/SheetCanvas.tsx`) renders the sheet as SVG and keeps
unfinished input (a stroke being drawn, an open polyline) in local state until it is
committed as one undo step; moves, scaling and erasing are gestures. Paper size, drawing scale
and image resolution are independent: the scale only converts paper lengths to real lengths
for readouts. Boards show drawings with the same SVG renderer.

**Visible capability state.** `engine/capabilities.ts` lists every planned feature with a
one-sentence explanation. Planned tools appear in the tool rail as disabled buttons with
that explanation as tooltip; inspectors show a "Not available yet" list. Nothing pretends
to work.

**One viewport for three workspaces.** `viewport/Viewport.tsx` handles zoom (wheel at
pointer, steps, fit, 100 %), pan (hand tool, Space, middle button), rulers and cursor
reporting. Content units are pixels in Compose and millimetres in Drawings and Boards; sheets
and boards are laid out directly in millimetres, so 1 content unit is 1 mm. Screen-space overlays
(selection, handles, guides) keep constant stroke widths at any zoom.

**Preview in the web view, export in the engine.** The canvas displays images and composes
layers with CSS transforms. Exports are rendered by the image engine at full resolution, and
adjusted layers are previewed with engine-rendered images so the canvas and the export use
the same adjustment code. The title block's "Renderer" cell says which is which.

## Engine boundary

The frontend reaches the engine only through `src/engine/` (what to ask for) and
`src/platform/` (`platform.engine`, `null` in the browser build). The backend uses PhotoCraft
crates only in `src-tauri/core/src/engine/`:

| File             | Responsibility                                                                    |
| ---------------- | --------------------------------------------------------------------------------- |
| `mod.rs`         | Public API, engine status, pinned upstream revision, export target checks         |
| `source.rs`      | Decoding with limits, colour conversion to sRGB RGBA at 8 or 16 bits              |
| `composition.rs` | `CompositionSpec` → transient PhotoCraft document → banded render, PNG/PSD export |
| `adjust.rs`      | Per-layer adjustments as clipped adjustment layers, composited in isolation       |
| `psd_file.rs`    | PSD/PSB composite import and layered PSD export                                   |
| `preview.rs`     | Reduced, cached sources for interactive previews                                  |

Rules:

1. ArchCompose's document model is the source of truth. `engine/composition.ts` turns a
   compose document into a `CompositionSpec` for one render; the backend builds an engine
   document from it and drops it afterwards. There is one undo history, the store's.
2. Engine work runs in `spawn_blocking` tasks; long renders never block the window.
3. Engine features are marked `desktopOnly` in `engine/capabilities.ts`; `isAvailableIn`
   disables their controls in the browser build with an explanation.
4. Source files are only read. Exports are written atomically and refused when the target is
   one of the source images.

See [UPSTREAM.md](UPSTREAM.md) for the integrated crates, limits and open questions.

## Windows notes

- Windows is the primary platform. Paths are handled as opaque strings from system
  dialogs; nothing assumes a separator except for display names.
- Builds work with the MSVC toolchain (recommended, used in CI) and with the GNU
  toolchain plus MinGW-w64 binutils. On GNU, the library is built as `rlib` only, because a
  `cdylib` exceeds the GNU linker's export limit.
- Test binaries that link Tauri start without the common-controls manifest and fail with
  `STATUS_ENTRYPOINT_NOT_FOUND`. All backend logic therefore lives in `archcompose-core`,
  which does not link Tauri, and the app crate's own test targets are disabled.

## Testing

| Layer                                                                                                                      | Tool                | Where                       |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------- |
| Model, camera math, store, capability registry                                                                             | Vitest              | `src/**/*.test.ts`          |
| UI flows in a browser at several window sizes                                                                              | Playwright          | `e2e/app.spec.ts`           |
| Documentation screenshots                                                                                                  | Playwright (opt-in) | `e2e/screenshots.spec.ts`   |
| Backend file I/O and the engine adapter (real PhotoCraft crates: decode, placement, blending, adjustments, PNG/PSD export) | `cargo test`        | `src-tauri/core`            |
| Real desktop runtime (IPC, disk, WebView2, engine import, export, adjustments, save/reopen)                                | Playwright over CDP | `scripts/desktop-smoke.mjs` |
| Development workflow only: session hook, Kanban board merge driver, Claude Code configuration                              | `node --test`       | `scripts/workflow/`         |

The workflow tests do not touch the app; `.github/workflows/workflow-checks.yml` runs them
when workflow files change (see [WORKFLOW.md](WORKFLOW.md)).
