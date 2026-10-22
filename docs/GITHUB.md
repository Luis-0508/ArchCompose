# GitHub repository setup

The repository files configure CI, Dependabot, pull request labelling, issue and pull
request templates and code owners. Some settings live only on GitHub and must be set by a
maintainer once the remote repository exists. This document lists them.

The README badges, issue template links and clone instructions assume the repository is
`Luis-0508/ArchCompose`. Update them if the repository lives elsewhere.

## What the repository already provides

| File                               | Purpose                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`         | Frontend checks and Playwright on Linux and Windows; Rust checks on Windows.     |
| `.github/workflows/labeler.yml`    | Creates the labels and labels pull requests from the changed paths.              |
| `.github/labeler.yml`              | Path rules for the labels. Keep it in sync with the project structure.           |
| `.github/dependabot.yml`           | Daily updates for GitHub Actions, npm and Cargo, up to 100 open PRs each.        |
| `.github/ISSUE_TEMPLATE/`          | Bug report and feature request forms; security reports go to private advisories. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Summary, validation and checklist for every pull request.                        |
| `.github/CODEOWNERS`               | Requests a review from the maintainer on every pull request.                     |

All actions are pinned to commit SHAs with the version in a comment. Dependabot updates both.

## Active settings

These settings were read back from the GitHub API on 2026-10-14. Only values that were
verified this way are listed here. Endpoints, relative to `repos/Luis-0508/ArchCompose`:

- the repository itself (merge settings, `security_and_analysis`)
- `rulesets/<id>` for "Protect main"
- `actions/permissions`, `actions/permissions/workflow` and
  `actions/permissions/fork-pr-contributor-approval` (`approval_policy`)
- `private-vulnerability-reporting`, `vulnerability-alerts` and `automated-security-fixes`

Re-check them and update this section when settings change.

### Pull requests

- Default branch: `main`.
- Squash merging, merge commits and rebase merging are all allowed.
- Head branches are deleted automatically after merging.
- Auto-merge is disabled.
- "Always suggest updating pull request branches" is enabled.

### Ruleset "Protect main"

Active, targets the default branch, no bypass actors.

- A pull request is required before merging, with 0 required approvals and no code owner
  review requirement (see [Adding a second maintainer](#adding-a-second-maintainer)). Stale
  approvals are dismissed on new pushes.
- All review conversations must be resolved.
- Required status checks, and the branch must be up to date with `main`:
  - `Frontend (ubuntu-latest)`
  - `Frontend (windows-latest)`
  - `Desktop backend (Windows)`
- Force pushes and branch deletion are blocked.

### Actions

- All actions are allowed.
- The default workflow token can only read repository contents and cannot approve pull
  requests. Workflows request what they need (`labeler.yml` asks for `issues: write` and
  `pull-requests: write`).
- Workflows from first-time contributors need approval before they run (`approval_policy`:
  `first_time_contributors`).

### Security

- Private vulnerability reporting is enabled. `SECURITY.md` and the issue template link rely
  on it.
- Dependabot alerts and Dependabot security updates are enabled. Version updates are
  configured by `.github/dependabot.yml`.
- Secret scanning and push protection are enabled.


### Labels

The labeler workflow creates its labels on every pull request run. Dependabot adds its own
`dependencies` and ecosystem labels.

## Recommendations

Not configured. Consider them when the project grows:

- Allow only squash merging if a linear history is wanted.
- Restrict allowed actions to actions from GitHub, verified creators,
  `dtolnay/rust-toolchain` and `Swatinem/rust-cache`, or require SHA pinning for actions.
- Enable code scanning (CodeQL default setup) for JavaScript/TypeScript, Rust and GitHub
  Actions.

## Adding a second maintainer

Requiring an approval or a code owner review needs an eligible reviewer other than the pull
request author. With a single maintainer, these requirements would still work for pull
requests from other contributors, which the maintainer can approve, but they would block
every pull request the maintainer opens, because no one else could approve it.

When a second maintainer joins:

1. Give them write (or maintain) access to the repository.
2. Add them to `.github/CODEOWNERS` next to `@Luis-0508`, for example
   `* @Luis-0508 @second-maintainer`, and merge that change. Code owners must have write
   access, or GitHub ignores the entry.
3. Only then edit the "Protect main" ruleset: set required approvals to 1 and enable "Require
   review from Code Owners".
4. Update [Active settings](#active-settings).

Until then, `.github/CODEOWNERS` lists only `@Luis-0508`. Do not add placeholder owners.

## Publishing the repository

Before making the repository public, confirm:

- No secrets, personal data or local machine paths are tracked.
- CI, Dependabot and automatic labelling are active.
- The README screenshots are current (`SCREENSHOTS=1 npx playwright test screenshots`).
