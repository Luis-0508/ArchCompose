# AGENTS.md

Guidance for coding agents and contributors working on ArchCompose. Read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing structure, and
[docs/UPSTREAM.md](docs/UPSTREAM.md) before touching anything engine-related.

## Ground rules

1. **The document model is pure.** All edits are functions in `src/model/` that take a
   `Project` and return a new one. No React, DOM or Tauri imports in `src/model/`. Add a
   unit test for every new model function.
2. **Edits go through the store.** Use `apply(label, recipe)` for discrete edits and
   `beginGesture` / `applyTransient` / `endGesture(label)` for drags and scrubbing. Labels
   are sentence case verb phrases ("Move layer"); they appear in the undo tooltip.
3. **No fake features.** A control either works or is visibly unavailable. Planned
   features are entries in `src/engine/capabilities.ts` with an honest note. Do not add
   buttons that do nothing.
4. **Errors are shown, not swallowed.** Use `notify("error", message)` with a sentence
   that says what happened and what to do. Rust commands return such sentences as `Err`.
5. **PhotoCraft stays behind the boundary.** Only `src-tauri/core/src/engine.rs` and
   `src/engine/` may know about an image engine. Never write code against PhotoCraft APIs
   that have not been verified by compiling against them.
6. **File safety.** Never write project files except through `write_project_file`
   (atomic). Never modify or delete users' image files.
7. **Platform differences live in `src/platform/`.** Workspaces never import Tauri.

## Design system

- Tokens are in `src/styles/tokens.css`. Use them; do not hard-code colours or sizes in
  components (sheet content on boards and drawings is the exception: it is paper and ink).
- One typeface, Archivo variable. Hierarchy comes from width (`--stretch-*`) and weight.
  Use `num` for numeric readouts (tabular, condensed).
- Sentence case everywhere. No all-caps labels. Buttons say what they do ("Import
  render", "Remove frame").
- Accent yellow (`--c-accent`) marks selection, focus and the primary action only.
  Red is for errors only.
- Reuse `ui/` components: `Button`, `IconButton` (always with a label), `Segmented`,
  `ToolRail`, `Tabs`, `TextField`, `NumberField`, `SelectField`, `SliderField`, `Readout`,
  `Section`, `EmptyState`, `PlannedList`, `FactList`, `Tooltip`.
- Every interactive element needs a visible focus state and an accessible name. Choice
  groups support arrow keys.

## Conventions

- English for code, comments, docs, commit messages. UI text is English.
- TypeScript strict mode; no `any`. Prettier formatting (100 columns).
- CSS Modules per component or workspace; shared panel styles in
  `src/workspaces/workspace.module.css`.
- Keep dependencies minimal. Discuss before adding UI frameworks or state libraries.

## Before you finish

```bash
npm run check && npm run build && npx playwright test
```

```bash
cd src-tauri && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

Update `docs/` when behaviour or structure changes, and `capabilities.ts` when a feature
becomes available.
