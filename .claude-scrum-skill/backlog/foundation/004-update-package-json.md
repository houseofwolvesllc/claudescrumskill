---
title: Update package.json files field to include lib/
epic: foundation
status: done
executor: claude
priority: P1-high
points: 1
labels: [type:story, executor:claude, P1-high, epic:foundation, ready-for-work]
persona: impl
blocked_by: []
blocks: []
sprint: 1
---

## Objective

Update `package.json` `files` field to include `lib/` so workflows ship in the published npm tarball. FR-4.

## Acceptance Criteria

- [ ] `files` field lists `.claude-plugin/`, `skills/`, `bin/`, `lib/`
- [ ] `npm pack --dry-run` includes lib/workflows/ in the tarball

## Dependencies
- **Blocked by:** none
- **Blocks:** none
