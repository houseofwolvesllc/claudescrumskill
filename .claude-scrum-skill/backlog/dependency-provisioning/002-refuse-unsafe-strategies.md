---
title: Refuse unsafe strategies rather than silently degrading
epic: dependency-provisioning
status: done
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:dependency-provisioning
persona: impl
blocked_by:
  - dependency-provisioning/001
---

## Objective

Refuse unsafe strategies rather than silently degrading

## Acceptance Criteria

- [ ] clone falls back to install when the filesystem has no copy-on-write support, and logs the substitution
- [ ] clone never performs a real recursive copy as a fallback
- [ ] symlink fails loud when any story in the batch is identified as touching package.json or a lockfile
- [ ] The symlink refusal names the offending story
- [ ] symlink does not downgrade to another strategy on refusal
- [ ] Unit tests cover both refusal paths

## Technical Context

A symlinked dependency directory is shared mutable state across concurrent stories: one story running an install corrupts its siblings mid-run. A real recursive copy of node_modules is precisely the expense clone exists to avoid, so falling back to it would defeat the strategy silently. Both refusals are correctness properties, not conveniences.
