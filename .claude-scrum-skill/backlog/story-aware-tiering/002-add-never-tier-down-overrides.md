---
title: Add the ops and P0-critical never-tier-down overrides
epic: story-aware-tiering
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:story-aware-tiering
persona: impl
blocked_by:
  - story-aware-tiering/001
---

## Objective

Add the ops and P0-critical never-tier-down overrides

## Acceptance Criteria

- [ ] A story with persona: ops never tiers down for any stage
- [ ] A story with priority: P0-critical never tiers down for any stage
- [ ] The overrides compose with the difficulty rules — an ops 1-point story still runs at the session model
- [ ] The overrides do not affect stages that were already absolute, such as detect-layout and pr
- [ ] Unit tests cover both overrides across several point values and stages

## Technical Context

Same reasoning the retune used to keep verification that guards destructive operations: ops stories are migrations, CI, secrets, and IaC, where 'what if this runs twice' makes blast radius beat cost. Two guard clauses, not a rules engine — the spec's pattern pass explicitly declined to name a pattern for two rules.
