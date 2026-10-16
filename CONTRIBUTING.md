# Contributing

Thanks for contributing to ArchCompose.

## Language

Repository-facing collaboration is in English: code, comments, documentation, filenames,
branches, commits, issues and pull requests. Conversation may use whatever language is
natural for the contributor.

## Before you start

- Read [AGENTS.md](AGENTS.md) for the ground rules, design system and conventions. They
  apply to human contributors too.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing structure, and
  [docs/UPSTREAM.md](docs/UPSTREAM.md) before touching anything engine-related.
- For larger changes, open an issue first so the approach can be discussed.
- The image engine is built on PhotoCraft crates. Engine work goes only through
  `src/engine/`, `src/platform/` and `src-tauri/core/src/engine/`, and only against APIs
  that have been verified by compiling against them. After changing Rust or npm
  dependencies, run `node scripts/third-party-licenses.mjs`.

## Setup

Follow the requirements and quick start in the [README](README.md#quick-start). Install the
Playwright browser once:

```bash
npx playwright install chromium
```

## Workflow

1. Create a focused branch from `main`.
2. Make the smallest complete change that solves the issue.
3. Add or update tests: unit tests next to the model code (`*.test.ts`), Playwright tests in
   `e2e/`, Rust tests in `src-tauri/core`.
4. Run the checks below.
5. Open a pull request with a clear English summary and validation notes.

## Optional tooling

The maintainer's default workflow uses Claude Code with a local Kanban board (`CLAUDE.md`,
`.claude/`, `.kanban/`) and the project memory in `docs/`.
None of it is required to contribute: the board is plain JSON you can read, and these files
do not affect building or testing the project. Please do not edit `.kanban/` in your pull
requests. See [docs/WORKFLOW.md](docs/WORKFLOW.md) for how the pieces fit together.

## Checks

```bash
npm run check && npm run build && npx playwright test
```

```bash
cd src-tauri && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

CI runs the same checks on Linux and Windows.

## Pull requests

Keep pull requests focused. Avoid unrelated refactors or formatting changes. Explain
behaviour changes, testing, and any remaining limitations. Include a screenshot when the UI
changes visibly, and regenerate the README screenshots if they are affected
(`SCREENSHOTS=1 npx playwright test screenshots`).

Pull requests are labelled automatically from the changed paths. Automated review tools such
as CodeRabbit provide suggestions. Verify findings against the actual code before applying
them.

## Documentation

Update the README or `docs/` when setup, architecture, public behaviour or contributor
workflow changes, and `src/engine/capabilities.ts` when a feature becomes available. Use real
screenshots and project assets; do not fabricate visuals or capabilities.

## Licence

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only), the licence of this
project.
