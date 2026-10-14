# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting ("Report a vulnerability" on the repository's
Security tab) when it is enabled. Otherwise contact the repository maintainer privately
through an appropriate channel listed on their GitHub profile.

Include enough information to reproduce and assess the issue, but do not include unrelated
secrets or personal data. Do not attach project files or images you are not allowed to share.

## Scope

ArchCompose is a local desktop application. Reports are especially relevant when they
concern:

- the Tauri IPC commands in `src-tauri/` and their file access (reading images, writing
  project files),
- the Content Security Policy and capability configuration in `src-tauri/tauri.conf.json`
  and `src-tauri/capabilities/`,
- parsing of `.archcompose` project files or imported images,
- anything that could modify or delete user files outside an explicit save.

## Supported versions

Until the project defines a formal release policy, security fixes target the current default
branch and the latest release, if releases exist.
