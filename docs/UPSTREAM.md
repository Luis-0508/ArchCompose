# Upstream: PhotoCraft

ArchCompose uses selected library crates of [PhotoCraft](https://github.com/storytold/photocraft)
as its image engine. This document records what is integrated, how, and what is still open.
Licensing and attribution are in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Pinned revision

|                  |                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Commit           | `c699e3cda69f4852b43c0b191ab0091aaeff9d6a`                                                     |
| Release          | 0.9.0, reviewed on 2026-10-14                                                                  |
| Pinned in        | `src-tauri/core/Cargo.toml` (`git = …, rev = …` for every crate) and `src-tauri/Cargo.lock`    |
| Also recorded in | `UPSTREAM_REVISION` in `src-tauri/core/src/engine/mod.rs`; a unit test fails if the two differ |

PhotoCraft's crates are not published on crates.io, so they are Git dependencies. They are
used unmodified.

## What PhotoCraft is

A layered photo editor in pure Rust (edition 2024, Rust ≥ 1.95), dual-licensed MIT OR
Apache-2.0. It is a Cargo workspace of about 25 crates in build-time enforced layers: L0
foundation (`geom`, `cms`, `color`, `raster`, standalone `psd` and `codecs`), L1 `doc` (the
document model as data), L2 `ops`, `algo`, `paint`, `text`, `vector`, L3 `compose` (CPU
compositor), `gpu`, `format`, L4 `io`, L5 `engine` (a `Session` and ~700 commands), L6
`ui-egui` and `automation`. Its apps are an egui desktop app, a CLI and a WebAssembly build.

## What ArchCompose uses

| Crate                | Used for                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `photocraft-codecs`  | Decoding PNG, JPEG, TIFF, WebP, OpenEXR, Radiance HDR, TGA, QOI and more, with decode limits; encoding PNG  |
| `photocraft-psd`     | Reading the merged composite of PSD and PSB files; writing layered PSD files                                |
| `photocraft-cms`     | Converting embedded RGB and CMYK ICC profiles and linear float images to sRGB                               |
| `photocraft-doc`     | The transient engine document: raster layers, opacity, visibility, clipped adjustment layers                |
| `photocraft-algo`    | Placing layers (`transform::warp_surface_clipped`), resizing, and filters (Gaussian blur, unsharp mask)     |
| `photocraft-compose` | Compositing (`render_bands`, `flatten_to_surface`) and the adjustments, including vibrance and photo filter |
| `photocraft-raster`  | Tiled surfaces (also pulled in by the crates above, with `geom`, `color` and `vector`)                      |

Not used: `engine`, `ops`, `io`, `text`, `paint`, `format`, `gpu`, `plugins`, `ui-egui`,
`automation`, and the apps. In particular ArchCompose does not link PhotoCraft's user
interface or any crate that embeds fonts, icons or dictionaries.

An inventory of further PhotoCraft tools, their APIs and how they fit, is in
[PHOTOCRAFT_TOOLS.md](PHOTOCRAFT_TOOLS.md). PhotoCraft's command registry is not exposed:
its commands need a `Session` with its own history, so each reused tool is a typed operation
whose parameters live in the ArchCompose document.

## How it is integrated

```text
ArchCompose project (frontend, authoritative)
   │  compositionSpec(project, doc): canvas size, layers bottom→top,
   │  file path, x, y, scale, opacity, visible, adjustments
   ▼
src/platform/desktop.ts ── Tauri IPC ──► src-tauri/src/lib.rs (spawn_blocking)
                                            │
                                            ▼
                              src-tauri/core/src/engine/   (the adapter)
                                source.rs       decode + colour conversion to sRGB RGBA 8/16-bit
                                composition.rs  spec → photocraft_doc::Document → render
                                adjust.rs       per-layer clipped adjustment layers
                                psd_file.rs     PSD composite import, layered PSD export
                                preview.rs      reduced sources for interactive previews
```

1. **ArchCompose's model stays the source of truth.** A compose document is translated into a
   PhotoCraft `Document` for one render or export and then dropped. No engine document is
   kept, so there is one history: ArchCompose's undo stack. Exports add no undo step.
2. **Placement.** Each layer becomes a raster layer. A layer at 100 % on whole pixels is
   copied exactly; anything else is resampled with PhotoCraft's bicubic warp, clipped to the
   canvas, with premultiplied alpha.
3. **Adjustments** (exposure, brightness, contrast, saturation) become PhotoCraft adjustment
   layers clipped to the layer and composited in isolation, so they change only that layer.
   The canvas preview of an adjusted layer is rendered by the same code (reduced to 2048 px),
   so preview and export agree. Source files are never modified.
4. **Formats the web view cannot show** (TIFF, PSD, PSB, OpenEXR, HDR, TGA, QOI) are decoded
   by the engine and handed to the web view as an 8-bit PNG preview. Exports read the original
   file again at full quality.
5. **Export** renders band by band into a full-resolution buffer and writes PNG (8-bit, or
   16-bit when any source is 16-bit or float) or a layered PSD (one layer per compose layer,
   hidden layers included, adjustments baked in, plus the merged composite), atomically, and
   never over one of the source images.

## Safety limits

PhotoCraft's parsers are written to reject malformed input without panicking and enforce
their own limits, but ArchCompose does not rely on that alone:

- Files larger than 512 MB are refused before reading (`files.rs`).
- Decoding is limited to 268 megapixels and 65 536 px per side (`source.rs`); PhotoCraft
  checks declared sizes before allocating.
- Canvases are limited to 268 megapixels and 32 768 px per side; large buffers are allocated
  fallibly, so running out of memory is reported instead of aborting.
- Every engine call runs on a blocking worker thread; the window stays responsive.
- Errors are sentences naming the file, shown to the user.

## Colour

Everything is composited in sRGB. Embedded RGB and CMYK profiles are converted to sRGB
(relative colorimetric; CMYK with black point compensation); CMYK without a profile uses
PhotoCraft's built-in coated CMYK profile. Float images (OpenEXR, HDR) are treated as
scene-linear and encoded to sRGB; values above white are clipped, without tone mapping. Gray
ICC profiles are not applied. Exports are untagged sRGB.

## Decisions on the original open questions

- **Crates or CLI sidecar?** Crates (option A). The L0–L3 crates compile cleanly as Git
  dependencies, are pure Rust (no C toolchain), pull no GPU or UI code, and give in-process,
  typed access with streaming render. A `photocraft-cli` sidecar would add a second binary,
  process start-up per operation and file-based exchange without a benefit for this scope.
- **`engine` crate?** Not used. Its `Session` keeps its own document and history, which would
  duplicate ArchCompose's undo. The lower crates provide what ArchCompose needs without it.
- **Build size and MSRV.** No `gpu`/`wgpu`. ArchCompose's Rust crates moved to
  `rust-version = "1.95"` (they stay on edition 2021; dependencies on edition 2024 are fine).
- **Bit depth.** 8- and 16-bit sources are kept at their depth through the composite and
  export; previews in the web view are 8-bit.

## Open questions

- Layered PSD import (separate layers, masks, blend modes) needs `photocraft-io`, which links
  `photocraft-text` and with it bundled fonts and a word list. Importing PSD layers also needs
  a way to reference a layer inside a file from an ArchCompose layer.
- Masks and selections need painting or selection tools in ArchCompose's own interface; the
  engine side (`LayerMask`, `photocraft-algo::selection`) exists.
- Exporting drawing sheets can use `photocraft-vector` for strokes and shapes; text needs
  `photocraft-text`, its bundled fonts, and a font that matches the web view's preview.
- Wide-gamut and HDR output (tagged exports, tone mapping) are not designed yet.

## Updating the pin

1. Change `rev` for every `photocraft-*` dependency in `src-tauri/core/Cargo.toml` and
   `UPSTREAM_REVISION`/`UPSTREAM_VERSION` in `src-tauri/core/src/engine/mod.rs`.
2. Read the upstream changelog and `AGENTS.md` for API changes; build and run
   `cargo test --workspace`, which exercises the adapter against the real crates.
3. Re-audit `NOTICE` and `ATTRIBUTION.md` at the new revision against the linked crates and
   update `THIRD_PARTY_NOTICES.md`; run `node scripts/third-party-licenses.mjs`.
4. Run the desktop smoke test (`npm run smoke:desktop`).
