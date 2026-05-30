---
title: Bump package.json to 2.0.0 and add [2.0.0] CHANGELOG entry
epic: release
status: backlog
executor: claude
priority: P1-high
points: 2
labels: [type:story, executor:claude, P1-high, epic:release, ready-for-work]
persona: impl
blocked_by: [skill-rewrites/001, skill-rewrites/002]
blocks: []
sprint: null
---

## Objective

Bump `package.json` from 1.8.1 to 2.0.0. Add `[2.0.0]` entry to CHANGELOG.md under Keep a Changelog format with Added/Changed/Removed/Migration sections. FR-35, FR-36.

## Acceptance Criteria

- [ ] package.json version = "2.0.0"
- [ ] CHANGELOG [2.0.0] entry has Added/Changed/Removed/Migration sections
- [ ] Migration section explicitly states users see no UX change, plugin/extension authors who hooked into old prose may need updates
- [ ] Migration section names v1.8.x as the fallback for older Claude Code

## Dependencies
- **Blocked by:** skill-rewrites/001, skill-rewrites/002
- **Blocks:** none
