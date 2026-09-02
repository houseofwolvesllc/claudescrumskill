---
title: Route sprint_pipeline stages through the timer and return _telemetry
epic: pipeline-telemetry-return
status: backlog
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:pipeline-telemetry-return
persona: impl
blocked_by:
  - telemetry-capture/002
---

## Objective

Route sprint_pipeline stages through the timer and return _telemetry

## Acceptance Criteria

- [ ] The current top-level return shape of sprint_pipeline.js is verified; if it is a bare array it is reconciled to an object so _telemetry is additive and non-breaking (consumer read updated in step).
- [ ] The timer is constructed once (const { timedAgent, timings } = createStageTimer(agent)) and every stage call (detect-layout, implement, review, verify, pr, reset, teardown) routes through timedAgent with its existing label/phase/tier opts.
- [ ] The workflow return includes a top-level _telemetry array of the collected intervals; a stage that returns null or throws still contributes exactly one interval.
- [ ] The return schema is extended to describe/validate _telemetry (array of {label, phase, startedAt, endedAt}); existing tests updated and the suite is green.

## Technical Context

lib/workflows/sprint_pipeline.js and its return schema. No stage behavior changes. timings is the array returned by createStageTimer; attach at the single return site.
