---
title: Apply tiers to every agent call in the workflow scripts
epic: agent-tiering
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:agent-tiering
persona: impl
blocked_by:
  - agent-tiering/001
---

## Objective

Apply tiers to every agent call in the workflow scripts

## Acceptance Criteria

- [ ] detect-layout, reset, and pr run at the cheapest tier with low effort
- [ ] implement runs at the session model and session effort
- [ ] verify runs at the session model with low effort
- [ ] review, skeptic, and judge run one tier down at medium effort
- [ ] elaborate runs at the session model with medium effort
- [ ] Every agent() call in lib/workflows/*.js supplies an explicit tier

## Technical Context

Sites: sprint_pipeline.js:388 (detect-layout), :613 (implement), :621 (review), :629 (verify), :639 (pr), :684 (reset); adversarial_verify.js (skeptic, judge); elaborate_epics.js:163 (elaborate).
