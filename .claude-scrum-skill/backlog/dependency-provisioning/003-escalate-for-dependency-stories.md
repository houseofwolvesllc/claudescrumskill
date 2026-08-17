---
title: Escalate to a validating install for dependency-touching stories
epic: dependency-provisioning
status: backlog
executor: claude
priority: P1-high
points: 5
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

Escalate to a validating install for dependency-touching stories

## Acceptance Criteria

- [ ] A story identified as touching package.json or a lockfile uses install even when the batch default is clone
- [ ] Detection runs before the story, from its technical_context and acceptance_criteria
- [ ] A story that adds a dependency without updating the lockfile fails under install
- [ ] Where cheap, a post-hoc reconciliation from git diff --name-only reports a story that touched dependency files without having been escalated
- [ ] The post-hoc mismatch is reported, not silently corrected
- [ ] Unit tests cover escalation, non-escalation, and the reconciliation report

## Technical Context

This is the hybrid that motivates the whole spec: clone speed for the roughly 90% of stories that never touch dependencies, clean-install validation for the ones that do. Under clone or symlink a missing lockfile update passes silently and breaks CI later; under install it fails during the story. Reporting the post-hoc mismatch rather than fixing it silently is deliberate — a silent correction hides a detection gap that will recur.
