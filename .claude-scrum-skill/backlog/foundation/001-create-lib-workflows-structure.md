---
title: Create lib/workflows/ directory structure
epic: foundation
status: backlog
executor: claude
priority: P1-high
points: 1
labels: [type:story, executor:claude, P1-high, epic:foundation, ready-for-work]
persona: impl
blocked_by: []
blocks: [foundation/002, workflow-scripts/001, workflow-scripts/002, workflow-scripts/003, workflow-scripts/004, workflow-scripts/005]
sprint: null
---

## Objective

Create the directory tree `lib/workflows/` and `lib/workflows/schemas/` at the npm package root with empty placeholder JavaScript files for the 5 workflow scripts. Subsequent stories author the content.

## Acceptance Criteria

- [ ] `lib/workflows/` exists with 5 empty .js files: sprint_pipeline.js, elaborate_epics.js, multi_spec_queue.js, adversarial_verify.js, review_panel.js
- [ ] `lib/workflows/schemas/` directory exists (empty)
- [ ] Directory layout matches FR-1 through FR-3 of the source spec

## Dependencies
- **Blocked by:** none
- **Blocks:** foundation/002 + all workflow-scripts stories
