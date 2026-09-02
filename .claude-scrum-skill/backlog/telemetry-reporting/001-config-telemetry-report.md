---
title: Add telemetry.report default to config.json and preserve on merge
epic: telemetry-reporting
status: backlog
executor: claude
priority: P2-medium
points: 1
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:telemetry-reporting
persona: ops
blocked_by:
  - pipeline-telemetry-return/001
---

## Objective

Add telemetry.report default to config.json and preserve on merge

## Acceptance Criteria

- [ ] skills/shared/config.json default gains telemetry.report set to true (nested under telemetry, matching scaffold.design_spike_enabled nesting).
- [ ] The bin/install.js merge preserves a user's existing telemetry.report value on reinstall, consistent with other keys.
- [ ] Test/verification confirms a pre-existing user value is not overwritten by the default.

## Technical Context

skills/shared/config.json and the existing config merge path in bin/install.js. No workflow reads this key.
