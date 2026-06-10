---
title: Author elaborate_epics.js
epic: workflow-scripts
status: done
executor: claude
priority: P1-high
points: 3
labels: [type:story, executor:claude, P1-high, epic:workflow-scripts, ready-for-work]
persona: impl
blocked_by: [foundation/001, foundation/002]
blocks: [skill-rewrites/002]
sprint: 2
---

## Objective

Author `lib/workflows/elaborate_epics.js` per contract. `parallel(epics.map(elaborate))` returning EpicSchema[] with stories populated. FR-7.

## Acceptance Criteria

- [ ] Each elaborator receives global preamble + epic's PRD slice + sibling skeleton
- [ ] Schema-validated returns per EpicSchema (with StorySchema[] populated)
- [ ] Failure: returns null for failed epic; calling skill marks stories needs-context
- [ ] Includes the required `meta` block

## Dependencies
- **Blocked by:** foundation/001, foundation/002
- **Blocks:** skill-rewrites/002
