---
title: Render the stage-timing section in sprint-release and orchestrate summary
epic: telemetry-reporting
status: backlog
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:telemetry-reporting
persona: impl
blocked_by:
  - telemetry-reporting/002
---

## Objective

Render the stage-timing section in sprint-release and orchestrate summary

## Acceptance Criteria

- [ ] sprint-release SKILL.md and the project-orchestrate post-run summary read telemetry.report and render the same stage-timing section from _telemetry when true, omit when false.
- [ ] The rendered numbers match the sprint-status computation (single shared definition of summed-stage cost vs critical-path wall-clock, described once and referenced).
- [ ] Full test suite green; no behavior change when telemetry.report is false.

## Technical Context

skills/sprint-release/SKILL.md and skills/project-orchestrate/SKILL.md summary section. Keep one authoritative description of the two metrics to avoid duplication across the three consumers.
