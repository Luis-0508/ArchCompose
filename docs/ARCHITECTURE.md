# Architecture

ArchCompose is a Tauri 2 desktop application. The interface is React and TypeScript,
rendered by the system web view (WebView2 on Windows). The Rust backend owns file access
and is the future home of the image engine.

```text
┌──────────────────────────── web view (TypeScript) ────────────────────────────┐
│ workspaces/ compose · drawings · boards     ui/ design system   viewport/     │
│        │ read state, dispatch edits              ▲                            │
│        ▼                                         │                            │
│ state/store.ts (zustand) ── history ──► model/ (pure document model + tests)  │
│        │                                                                      │
│ app/commands.ts ─► platform/ (desktop │ browser)   engine/ (capabilities,     │
│                       │                             preview decoding)         │
└───────────────────────┼───────────────────────────────────────────────────────┘
                        │ Tauri IPC (invoke)
┌───────────────────────▼──────────── Rust ─────────────────────────────────────┐
│ src-tauri/src/lib.rs  commands: read_file, read_project_file,                 │
│                       write_project_file, engine_status                       │
│ src-tauri/core        files.rs (validated, atomic file I/O)                   │
│                       engine.rs (engine boundary; no engine linked yet)       │
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
| `src/engine/`     | The engine boundary on the frontend: the capability registry and preview decoding through the web view.                                | Nothing app-specific.                                                          |
| `src-tauri/core`  | Tauri-free backend logic, unit tested.                                                                                                 | `serde`.                                                                       |
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

**Pixels are not in the project.** A project file (`.archcompose`, JSON, schema version 1)
references assets by absolute path. Pixel data lives in `state/assetCache.ts` as object
URLs; on open, the cache reloads each asset through the platform and marks missing files,
which the library, canvas and submission check then show.

**Careful file handling.** The Rust side validates paths (exists, is a file, size limits:
512 MB images, 64 MB projects) and returns sentences the UI shows verbatim. Projects are
written to a temporary file in the same folder, flushed, and renamed over the target, so a
failure never leaves a truncated project. Parsing validates the structure and rejects files
from newer schema versions with an explicit message. The app asks before discarding unsaved
changes, including when the window is closed.

**Visible capability state.** `engine/capabilities.ts` lists every planned feature with a
one-sentence explanation. Planned tools appear in the tool rail as disabled buttons with
that explanation as tooltip; inspectors show a "Not available yet" list. Nothing pretends
to work.

**One viewport for three workspaces.** `viewport/Viewport.tsx` handles zoom (wheel at
pointer, steps, fit, 100 %), pan (hand tool, Space, middle button), rulers and cursor
reporting. Content units are pixels in Compose and Drawings and millimetres in Boards; a
board is laid out directly in millimetres, so 1 content unit is 1 mm. Screen-space overlays
(selection, handles, guides) keep constant stroke widths at any zoom.

**Preview, not engine.** The web view displays images and composes layers with CSS
transforms. That is a preview of the document model, not an export pipeline, and the UI
says so (title block "Renderer" cell, planned "Export image").

## Engine boundary

The frontend talks to an engine only through `src/engine/`; the backend wires one only in
`src-tauri/core/src/engine.rs`, which today reports `engineLinked: false`. When PhotoCraft
(or another engine) is integrated:

1. Add the dependency to `src-tauri/core` only.
2. Expose engine operations as new Tauri commands in `src-tauri/src/lib.rs` that call into
   `archcompose_core::engine`.
3. Add the matching calls to `src/platform/` (desktop) and switch the relevant entries in
   `engine/capabilities.ts` to `available`.
4. Keep ArchCompose's document model as the source of truth; translate to engine documents
   at the boundary.

See [UPSTREAM.md](UPSTREAM.md) for what is known about PhotoCraft and the open questions.

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

| Layer                                          | Tool                | Where                       |
| ---------------------------------------------- | ------------------- | --------------------------- |
| Model, camera math, store, capability registry | Vitest              | `src/**/*.test.ts`          |
| UI flows in a browser at several window sizes  | Playwright          | `e2e/app.spec.ts`           |
| Documentation screenshots                      | Playwright (opt-in) | `e2e/screenshots.spec.ts`   |
| Backend file I/O and engine status             | `cargo test`        | `src-tauri/core`            |
| Real desktop runtime (IPC, disk, WebView2)     | Playwright over CDP | `scripts/desktop-smoke.mjs` |
