---
title: Namespace story branches per epic
epic: parallel-run-safety
status: backlog
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:parallel-run-safety
persona: impl
---

## Objective

Namespace story branches per epic

## Acceptance Criteria

- [ ] Story branches are named story/<epic-slug>/<story-slug>
- [ ] Every place a story branch is constructed, matched, or cleaned up is updated
- [ ] Two batches from different epics with identical story slugs no longer collide
- [ ] A structural test asserts no story branch is constructed without its epic prefix

## Technical Context

Not hypothetical: two concurrent runs in this repo both wanted story/document-credential-resolution, and afterwards the ref pointed at whichever finished last. The collision was found by a contaminated measurement rather than by a test, which is why the acceptance criteria include a structural guard.
