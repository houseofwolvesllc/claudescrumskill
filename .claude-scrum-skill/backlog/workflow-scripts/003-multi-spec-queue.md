---
title: Author multi_spec_queue.js
epic: workflow-scripts
status: done
executor: claude
priority: P1-high
points: 5
labels: [type:story, executor:claude, P1-high, epic:workflow-scripts, ready-for-work]
persona: impl
blocked_by: [foundation/001, foundation/002]
blocks: [skill-rewrites/001]
sprint: 2
---

## Objective

Author `lib/workflows/multi_spec_queue.js` per contract. Sequential queue using one-level `workflow("per_spec_orchestration", args)` per spec. Updates queue state file between specs. FR-8.

## Acceptance Criteria

- [ ] Sequential iteration; no concurrent specs
- [ ] One-level workflow() nesting per Workflow tool constraints
- [ ] Updates orchestration-queue-state.md after each transition (pending → in-progress → completed | paused | skipped)
- [ ] --skip-on-pause flag handled per FR-9
- [ ] Includes the required `meta` block

## Dependencies
- **Blocked by:** foundation/001, foundation/002
- **Blocks:** skill-rewrites/001
