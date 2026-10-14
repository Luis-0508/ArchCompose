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

## Settings to configure on GitHub

### General

- Default branch: `main`.
- Pull requests: allow squash merging (preferred); disable merge commits if a linear history
  is wanted. Enable "Automatically delete head branches".
- Do not enable auto-merge by default.

### Branch protection for `main`

Use a branch ruleset (Settings → Rules → Rulesets) or classic branch protection:

- Require a pull request before merging, with at least one approval when there is more than
  one maintainer. Require review from code owners.
- Require status checks to pass, and require branches to be up to date. Required checks (job
  names from `ci.yml`, available after the first CI run):
  - `Frontend (ubuntu-latest)`
  - `Frontend (windows-latest)`
  - `Desktop backend (Windows)`
- Require conversation resolution before merging.
- Block force pushes and branch deletion.

### Actions

- Settings → Actions → General: allow GitHub Actions. Optionally restrict to actions from
  GitHub, verified creators and `dtolnay/rust-toolchain` and `Swatinem/rust-cache`.
- Workflow permissions: "Read repository contents" is enough. The workflows request the
  permissions they need (`labeler.yml` asks for `issues: write` and `pull-requests: write`).
- Require approval for workflows from first-time contributors.

### Security

- Enable private vulnerability reporting (Settings → Security). `SECURITY.md` and the issue
  template link rely on it.
- Enable Dependabot alerts and Dependabot security updates. Version updates are configured
  by `.github/dependabot.yml`.
- Enable secret scanning and push protection.
- Optionally enable code scanning (CodeQL default setup) for JavaScript/TypeScript, Rust and
  GitHub Actions.

### CodeRabbit

- Install the CodeRabbit GitHub app for this repository if automated reviews are wanted.
- Treat its findings as suggestions to verify, not instructions (see `AGENTS.md`). It is not
  a required check.

### Labels

The labeler workflow creates its labels on the first pull request. Dependabot adds its own
`dependencies` and ecosystem labels.

## Publishing the repository

Before making the repository public, confirm:

- No secrets, personal data or local machine paths are tracked.
- CI, Dependabot, automatic labelling and (if used) CodeRabbit are active.
- The README screenshots are current (`SCREENSHOTS=1 npx playwright test screenshots`).
