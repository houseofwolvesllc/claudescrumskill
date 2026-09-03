---
title: Register stage_timing in inline manifest and guard drift
epic: telemetry-capture
status: backlog
executor: claude
priority: P1-high
points: 2
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:telemetry-capture
persona: impl
blocked_by:
  - telemetry-capture/001
---

## Objective

Register stage_timing in inline manifest and guard drift

## Acceptance Criteria

- [ ] stage_timing is added to the sprint_pipeline.js entry in lib/workflows/_shared/inline_manifest.mjs.
- [ ] bin/regen_workflow_inlines.mjs is run and expands the canonical stage_timing block into sprint_pipeline.js with BEGIN/END markers.
- [ ] inline_sync.test.mjs passes and asserts the inlined stage_timing block is byte-identical to canonical; the full test suite is green.

## Technical Context

Manifest entry plus regen run. Do not hand-edit the inlined block; regenerate it. Only sprint_pipeline.js is registered in this spec (see E2 scope decision).
