# Roadmap

Milestones are ordered by dependency, not by date. Each milestone should leave the app
releasable, with tests, and with `engine/capabilities.ts` updated to match reality.

## Milestone 1: Foundation (done)

- Tauri 2 desktop app with React, TypeScript and a Rust backend.
- Design system, shared viewport with rulers, title-block status bar, keyboard shortcuts.
- Compose: import renders, place images as layers, move, scale, reorder, hide, lock,
  opacity, horizon guide, undo/redo.
- Drawings: drawing set with sheet numbers, kinds, scales, levels, attached files,
  revisions.
- Boards: ISO A0 to A4 and custom sheets, layout grid, grid frames with images, drawings
  and text, effective-resolution and completeness check.
- Project files with atomic saves and missing-file handling.

## Milestone 2: Everyday reliability

- Recent projects and reopening the last project (`loadProjectFromPath` exists).
- Relinking missing files; storing paths relative to the project file where possible.
- Autosave to a recovery file.
- Duplicate layers, frames and boards; multi-select.
- Asset kind editing and search in the library.
- Unsaved-changes and error messages reviewed with users.

## Milestone 3: Image engine (PhotoCraft) (first increments done)

See [UPSTREAM.md](UPSTREAM.md). Decided: PhotoCraft library crates linked into
`src-tauri/core`, no `photocraft-engine` session and no CLI sidecar.

- Done: import of TIFF, PSD/PSB (composite), OpenEXR, HDR, TGA and QOI with colour conversion
  to sRGB.
- Done: full-resolution PNG export (8 or 16 bit, with transparency) and layered PSD export of
  compose views, rendered by PhotoCraft's compositor.
- Done: per-layer exposure, brightness, contrast and saturation, previewed by the engine.
- Next: layer masks, then filters (blur, sharpen) per layer, then layered PSD import.

## Milestone 4: Compose depth

- Perspective calibration: ground plane and vanishing points from user-drawn lines.
- Scale-aware placement of people and vegetation (eye-level and real height).
- Contact and directional shadows (engine).
- Masks and selections (engine).
- Curated asset libraries with real-world heights.

## Milestone 5: Drawings depth

- PDF and SVG import with vector preview.
- Two-point scale calibration of raster drawings.
- Revision comparison (overlay and side by side).
- Annotations, labels and diagram overlays.

## Milestone 6: Boards to print

- Place drawings at true scale.
- Print-ready PDF export with embedded fonts and images at full resolution.
- Submission rules per school or competition (sheet count, format, required elements).
- Linked compose views on boards, updated when the view changes.
