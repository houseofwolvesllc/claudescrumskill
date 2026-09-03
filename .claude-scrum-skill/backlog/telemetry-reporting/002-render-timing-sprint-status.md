---
title: Render the stage-timing section in sprint-status
epic: telemetry-reporting
status: backlog
executor: claude
priority: P2-medium
points: 2
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:telemetry-reporting
persona: impl
blocked_by:
  - telemetry-reporting/001
---

## Objective

Render the stage-timing section in sprint-status

## Acceptance Criteria

- [ ] sprint-status SKILL.md reads telemetry.report from ../shared/config.json.
- [ ] When true, it renders a stage-timing section from the workflow _telemetry: per-phase/label summed duration, count, and share, plus overall critical-path wall-clock (max endedAt - min startedAt) and summed-stage cost.
- [ ] When false, no timing section is rendered; the underlying _telemetry is unaffected.
- [ ] Critical-path wall-clock <= summed-stage cost whenever any stages overlap.

## Technical Context

skills/sprint-status/SKILL.md. Arithmetic over intervals is markdown-instructed (Claude computes), mirroring how scaffolding/paths keys are consumed.
