---
title: Create createStageTimer factory with tests-first timing capture
epic: telemetry-capture
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:telemetry-capture
persona: impl
---

## Objective

Create createStageTimer factory with tests-first timing capture

## Acceptance Criteria

- [ ] stage_timing.test.mjs is written first (red) and covers: one interval per call with the call's label/phase and startedAt <= endedAt in ISO-8601; result returned unchanged including a null result; interval recorded AND error re-thrown when agentFn throws; intervals accumulate across multiple and concurrent calls; empty run yields [].
- [ ] lib/workflows/_shared/stage_timing.mjs exports createStageTimer(agentFn) returning { timedAgent, timings } per the spec's reference sketch.
- [ ] endedAt is stamped in a finally so success, null-return, and throw paths all record exactly one interval; the throw path re-throws.
- [ ] Uses only Date; no import/require/fs/child_process; all tests pass under node --test.

## Technical Context

New module lib/workflows/_shared/stage_timing.mjs and colocated lib/workflows/_shared/stage_timing.test.mjs. Follow _shared conventions (snake_case.mjs file, camelCase exports). agentFn injected for testability.
