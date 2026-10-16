# Project state

Narrative snapshot of where ArchCompose stands. **The repository is authoritative:** if git,
the code, the task board or GitHub disagree with this file, trust them and correct this file.

- Last updated: 2026-10-16
- Verified against: `main` at `cd504cf`

## What exists

- Tauri 2 desktop app (React, TypeScript, Rust); the browser build runs without the engine
  and shows engine features as unavailable.
- Compose workspace: layers from imported renders with move, scale, order, visibility,
  locks, opacity, horizon guide; per-layer exposure, brightness, contrast, saturation,
  vibrance, warmth, Gaussian blur and unsharp-mask sharpening previewed by the engine.
- Drawings workspace: drawing set with sheet numbers, kinds, scales, levels and revisions;
  editable paper sheets (A0 to A4 or custom) with grid, snapping, rulers, image underlay and
  pen, eraser, line, rectangle, circle, polyline and text (PR #4).
- Boards workspace: ISO and custom sheets, layout grid, frames with images, drawings and
  text, submission check.
- Image engine on PhotoCraft crates (PR #3): import of TIFF, PSD/PSB composite, OpenEXR,
  HDR, TGA, QOI; full-resolution PNG and layered PSD export.
- Project files (`.archcompose`, JSON, schema version 2) with atomic saves, migrations and
  missing-file marking; snapshot undo for every edit; local user profiles (PR #2).
- CI on Linux and Windows (format, lint, typecheck, Vitest, build, Playwright, Rust fmt,
  clippy, tests, third-party licence check), PR labeler, daily Dependabot.
- Development workflow: local Kanban board, this project memory, SessionStart hook and
  workflow tests (decision 0001).

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together, [DECISIONS/](DECISIONS/README.md)
for why, and [ROADMAP.md](ROADMAP.md) for the milestone plan.

## Active work

- No tickets in Doing or Review.
- Workflow migration on `chore/unified-claude-workflow`; PR open for review. Maintenance
  work, no ticket.
- Open Dependabot PR #5 (TypeScript 7.0.2).

## Blockers

- None.

## Next priorities

The board order (To do, top first) is the priority. All tickets are `stub`s from
`docs/ROADMAP.md` whose specs need refining and approval before implementation; the
maintainer decides whether milestone 2 or the next PhotoCraft increments come first.

1. **EP-1 Milestone 2: Everyday reliability**: K-1 recent projects, K-2 relink and relative
   paths, K-3 autosave, K-4 duplicate and multi-select, K-5 asset kinds and search, K-6
   review messages with users.
2. **EP-2 Milestone 3: Next PhotoCraft increments**: K-7 drawing sheet export through
   `photocraft-vector`, K-8 masks, K-9 brush and eraser (depends on K-8), K-10 layered PSD
   import.

Milestones 4 to 6 stay in `ROADMAP.md` until they are planned in detail.

## Known limitations

- Asset paths in project files are absolute; missing files can be detected but not
  relinked.
- No autosave or crash recovery.
- The canvas is a web-view preview; only exports are rendered by the engine.
