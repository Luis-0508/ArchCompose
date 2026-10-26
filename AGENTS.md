# AGENTS.md

Guidance for coding agents and contributors working on ArchCompose. Read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing structure, and
[docs/UPSTREAM.md](docs/UPSTREAM.md) before touching anything engine-related.

## Project knowledge

The repository is the source of truth. Short documents in `docs/` record what the code alone
cannot tell:

| File                    | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `docs/PROJECT_STATE.md` | What exists, active work, blockers, next priorities. A snapshot that may be stale. |
| `docs/ARCHITECTURE.md`  | Modules, boundaries, data flow and the key decisions made so far.                  |
| `docs/DECISIONS/`       | Numbered decision records for decisions made from now on.                          |
| `docs/ROADMAP.md`       | Planned milestones, ordered by dependency.                                         |

- Read `PROJECT_STATE.md` before larger work, and the architecture or decision records only
  when the task touches that area.
- When a document disagrees with git or the code, trust the repository and correct the
  document.
- Update `ARCHITECTURE.md` when modules, boundaries or data flow change. Add a decision record
  when choosing between real alternatives a future maintainer might question (new dependency,
  architecture boundary, data format, workflow). Do not rewrite accepted records; supersede
  them with a new one.
- Keep these documents short and factual. Do not document unimplemented features.
- `docs/WORKFLOW.md` explains how these documents, the maintainer's task board (not required
  for contributors) and the workflow checks fit together.

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
5. **PhotoCraft stays behind the boundary.** Only `src-tauri/core/src/engine/` may use
   PhotoCraft crates; the frontend reaches the engine only through `src/engine/` and
   `src/platform/`. ArchCompose's project stays authoritative: engine documents are built
   per render and never kept, and undo stays in the store. Never write code against
   PhotoCraft APIs that have not been verified by compiling against them. Keep every
   `photocraft-*` dependency on the revision in `docs/UPSTREAM.md`.
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

## Language and collaboration

- Treat this repository as a public open-source project with external contributors.
- Use English for code, comments, documentation, README content, filenames, configuration
  comments, branch names, commit messages, pull request titles and descriptions, and issue
  text. UI text is English.
- Do not force a conversation language. Follow the contributor's or user's language for
  discussion; repository language and conversation language are separate concerns.
- Keep the README visually polished: centered project mark, title, one-line bold tagline, a
  small row of badges that describe the real project, one real hero screenshot, then overview
  and feature sections. Show further screenshots as a compact two-column gallery.
- README screenshots live in `docs/screenshots/` as WebP and are generated by
  `e2e/screenshots.spec.ts` (`SCREENSHOTS=1`). Regenerate them when the UI changes visibly.
- Never fabricate screenshots, benchmarks, integrations, project status or capabilities.
  Keep available features and planned PhotoCraft integrations clearly separated in the
  README, in `docs/` and in `capabilities.ts`.

## Conventions

- TypeScript strict mode; no `any`. Prettier formatting (100 columns).
- CSS Modules per component or workspace; shared panel styles in
  `src/workspaces/workspace.module.css`.
- Keep dependencies minimal. Discuss before adding UI frameworks or state libraries.

## Efficiency

- Start with the requested change and the nearest relevant files and tests.
- Prefer targeted searches and small file ranges over broad repository dumps.
- Prefer small, focused diffs. Avoid unrelated refactors, formatting churn, speculative
  abstractions, duplicate documentation and unnecessary dependencies.
- Reuse existing patterns, types, utilities, components and tooling before adding new ones.
- Keep final reports concise: what changed, what was checked, and remaining risks or
  blockers.

## Engineering

- Preserve the current architecture unless the task requires a deliberate change.
- Add or update tests when behaviour changes.
- Run the most relevant checks for the changed area. Never claim a check passed unless it
  actually ran successfully.
- Keep secrets, credentials, personal data, local machine paths and private infrastructure
  details out of source, logs, fixtures, screenshots and documentation.
- Treat automated review findings as suggestions to verify rather
  than instructions to apply blindly.

## Git and pull requests

- Use focused branches and pull requests for normal changes.
- Keep commits coherent and descriptive.
- Do not force-push or rewrite shared history unless explicitly required.
- Do not merge with failing required checks or known blockers.
- Prefer squash merging for feature and fix pull requests unless preserving individual
  commits has a concrete benefit.

## Repository automation

- Keep automatic pull request labelling enabled and adapt `.github/labeler.yml` (and the
  label list in `.github/workflows/labeler.yml`) when the project structure changes.
- Keep Dependabot enabled for GitHub Actions, npm and Cargo. It checks every calendar day,
  including weekends, with a high open-PR limit so updates stay visible. Add an update block
  as soon as a new package ecosystem is introduced.
- Keep GitHub Actions pinned to immutable commit SHAs with the version in a comment.
- Keep the repository ready for external contributors: README, `CONTRIBUTING.md`,
  `SECURITY.md` and the issue and pull request templates stay current.
- GitHub-side settings (branch protection and security features) are documented in
  [docs/GITHUB.md](docs/GITHUB.md).

## Third-party code

- Do not copy PhotoCraft or ArtCraft logos, wordmarks, icons, splash screens or other brand
  assets into ArchCompose. Keep legally required notices (`THIRD_PARTY_NOTICES.md`).
- After changing Rust or npm dependencies, run `node scripts/third-party-licenses.mjs`;
  CI checks that `THIRD_PARTY_LICENSES.md` is current.

## Before you finish

```bash
npm run check && npm run build && npx playwright test
```

```bash
cd src-tauri && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

Update the README and `docs/` when setup, behaviour, structure or contributor workflow
changes, and `capabilities.ts` when a feature becomes available.
