# Upstream: PhotoCraft

ArchCompose intends to use selected capabilities of
[PhotoCraft](https://github.com/storytold/photocraft) as its image engine. This document
records what we know about PhotoCraft, what is decided, and what is still open. Nothing in
the ArchCompose code base calls PhotoCraft today.

## What PhotoCraft is (as reviewed on 2026-10-14)

Facts taken from PhotoCraft's README, `AGENTS.md` and `docs/architecture.md` at commit
`ed7df56` (2026-10-14):

- A layered photo editor written from scratch in pure Rust, dual-licensed **MIT or
  Apache-2.0**. Version 0.8.2, Rust edition 2024, minimum Rust 1.95.
- A Cargo workspace of about 25 library crates with build-time enforced layering
  (`cargo xtask layers`). Relevant layers:
  - L0 foundation: `geom`, `cms` (ICC colour management), `color`, `raster` (tiled
    copy-on-write surfaces); standalone format crates `psd` and `codecs` with no
    workspace dependencies.
  - L1 `doc`: the document model (layers, masks, adjustments, effects, smart objects) as
    pure data.
  - L2 `ops` (history/undo), `algo` (adjustments, filters, selection), `paint`, `text`,
    `vector`.
  - L3 `compose` (CPU compositor, the reference), `gpu` (wgpu compositor), `format`
    (native `.pcraft`).
  - L4 `io` (document ⇄ PSD and flat formats), `plugins`.
  - L5 `engine`: a `Session` plus a registry of roughly 700 commands; "every action is a
    command" with a stable command id and serializable parameters.
  - L6 `ui-egui` (its own GUI) and `automation` (MCP server).
- Apps: `photocraft` (desktop, egui on wgpu), `photocraft-cli` (headless
  `convert/info/run/batch/commands/mcp`), `photocraft-web` (WebAssembly).
- Nothing below `ui-egui` depends on egui, winit or rfd.
- The crates are **not published on crates.io** (checked 2026-10-14 for
  `photocraft-psd`, `photocraft-engine`, `photocraft-doc`).

## Decisions

1. **ArchCompose keeps its own document model.** ArchCompose documents describe
   architectural intent: compose views with placed assets and a horizon, drawing sets
   with sheet numbers and scales, boards with paper formats and grids. They reference
   image files; they do not contain pixels. A PhotoCraft document, when used, is an
   implementation detail of rendering and editing a raster asset or a compose view.
2. **No PhotoCraft UI.** PhotoCraft's egui shell is not used. ArchCompose's interface stays
   in React; the engine runs in the Rust backend.
3. **One integration point.** All engine access goes through
   `src-tauri/core/src/engine.rs` on the Rust side and `src/engine/` on the frontend side.
   No other module may import PhotoCraft crates or reference PhotoCraft concepts.
4. **Capabilities, not assumptions.** The UI asks `src/engine/capabilities.ts` whether a
   feature is available. Enabling a feature backed by PhotoCraft means changing its status
   there once the backend really provides it.
5. **No speculative code.** No traits, types or commands imitate PhotoCraft APIs before an
   integration spike has compiled against them.

## Candidate integration strategies

| Option                               | What it means                                                                                                                       | For                                                                           | Against                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A. Git dependency on selected crates | `src-tauri/core` depends on `photocraft-psd`, `photocraft-codecs`, later `photocraft-doc`/`compose`/`engine` via `git = …, rev = …` | In-process, typed, fast; PhotoCraft's layering makes leaf crates usable alone | Requires Rust 1.95 and edition 2024; pulls a large dependency tree (wgpu if `gpu`/`engine` are used); API stability unknown |
| B. Sidecar process                   | Ship `photocraft-cli` as a Tauri sidecar and drive it with `run`/`batch` or its MCP/JSON channel                                    | Strong isolation, no build coupling, version pinning by binary                | Process start-up and file-based exchange per operation; harder interactive previews                                         |
| C. Vendored subset                   | Copy selected crates into this repository                                                                                           | Full control                                                                  | Fork maintenance; loses upstream fixes. Last resort only                                                                    |

**Current recommendation:** start with option A for the standalone L0 crates (`psd`,
`codecs`) to gain PSD/TIFF import and full-resolution export, because they have no
workspace dependencies. Evaluate `engine` (option A) versus the CLI sidecar (option B) for
non-destructive editing once a spike shows the build size and API fit.

## Open questions

- Is the `engine` crate's `Session`/command API intended to be embedded by other
  applications, and how stable are command ids and parameter schemas?
- Can `engine` be built without the `gpu` crate (CPU compositor only) to keep the desktop
  build small? Does it need a wgpu device from the host?
- How are colour management and bit depth exposed to an embedding host (ArchCompose
  previews in the web view are 8-bit sRGB)?
- How should compose-view layers (assets placed with position and scale) map onto
  PhotoCraft layers, and who owns undo for engine-backed edits?
- MSRV: ArchCompose currently builds with Rust ≥ 1.80; adopting PhotoCraft raises it to
  1.95 and may require moving the backend crates to edition 2024.

## Licensing and attribution

PhotoCraft's code is MIT or Apache-2.0. Both are compatible with ArchCompose's AGPL-3.0-only
licence: PhotoCraft code may be linked or vendored into ArchCompose, and the combined work is
distributed under the AGPL. When code is linked or vendored, its `NOTICE` and the relevant entries of `ATTRIBUTION.md` must be
carried into ArchCompose's distribution. The ArtCraft name, wordmark and logos are
trademarks and are not covered by the licence; ArchCompose must not use them.

## Updating this document

Re-check the facts above against PhotoCraft's `AGENTS.md` and `docs/architecture.md`
before starting integration work, and record the commit you reviewed.
