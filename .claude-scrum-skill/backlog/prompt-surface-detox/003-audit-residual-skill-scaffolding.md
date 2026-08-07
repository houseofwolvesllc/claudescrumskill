---
title: Audit residual scaffolding in the remaining skill files
epic: prompt-surface-detox
status: backlog
executor: claude
priority: P2-medium
points: 5
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:prompt-surface-detox
persona: impl
---

## Objective

Audit residual scaffolding in the remaining skill files

## Acceptance Criteria

- [ ] Each headed step in project-cleanup and project-orchestrate is classified as fragile sequencing or removable scaffolding, with the classification recorded
- [ ] Removable scaffolding is removed; fragile sequencing is retained unchanged
- [ ] No destructive or order-dependent operation loses its guarding sequence
- [ ] No verification phrasing and no delegation encouragement is introduced
- [ ] A short written summary lists what was removed and what was deliberately kept

## Technical Context

project-cleanup carries 27 headed steps, project-orchestrate 25. This needs per-step judgment; a blanket trim is explicitly out of scope. Both files also carry v2.0.0 runtime preconditions that must survive.
