## Summary

<!-- What changed and why? Link the issue if there is one. -->

## Validation

<!-- List the checks and tests you actually ran. -->

## Notes

<!-- Risks, limitations, screenshots of UI changes, migration notes, or follow-up work. -->

### Checklist

- [ ] The change is focused and does not include unrelated refactors.
- [ ] Repository-facing text, documentation, branches, commits and PR content are in English.
- [ ] `npm run check`, `npm run build` and `npx playwright test` pass.
- [ ] Rust checks pass (`cargo fmt`, `cargo clippy -D warnings`, `cargo test`) if `src-tauri/` changed.
- [ ] Model changes have unit tests; edits go through the store with a named undo step.
- [ ] No control was added that does nothing; `src/engine/capabilities.ts` matches reality.
- [ ] README, `docs/` and screenshots were updated if setup, architecture or visible behaviour changed.
- [ ] No secrets, personal data, local machine paths or private infrastructure details were added.
