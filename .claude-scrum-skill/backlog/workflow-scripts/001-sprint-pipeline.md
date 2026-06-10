---
title: Author sprint_pipeline.js
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

Author `lib/workflows/sprint_pipeline.js` per the contract in the source spec's Technical Specifications → Workflow Script Contracts → sprint_pipeline.js. Per-story `pipeline(stories, implement, review, verify, openPR)` returning `SprintStoryReturn[]`. FR-6.

## Acceptance Criteria

- [ ] Valid JS using Workflow tool primitives (agent, parallel, pipeline)
- [ ] Schema-validated returns per StorySchema, ReviewVerdictSchema, SprintStoryReturnSchema
- [ ] Failure modes per FR-12: failed pipeline items drop to null; review-block → status: blocked; openPR failure → status: blocked with reason
- [ ] Includes the required `meta` block

## Dependencies
- **Blocked by:** foundation/001, foundation/002
- **Blocks:** skill-rewrites/001
