---
title: Author review_panel.js
epic: workflow-scripts
status: done
executor: claude
priority: P1-high
points: 3
labels: [type:story, executor:claude, P1-high, epic:workflow-scripts, ready-for-work]
persona: impl
blocked_by: [foundation/001, foundation/002]
blocks: [skill-rewrites/004]
sprint: 2
---

## Objective

Author `lib/workflows/review_panel.js` per contract. parallel(lensSet.map(reviewWithLens)) + aggregation. Returns panel verdict + per-lens verdicts. FR-10.

## Acceptance Criteria

- [ ] Lenses: correctness, security, style, tests
- [ ] Schema-validated per-lens returns per ReviewVerdictSchema
- [ ] Aggregation rule: any lens block → panel block; any accept-with-followups → panel accept-with-followups; else accept
- [ ] Includes the required `meta` block

## Dependencies
- **Blocked by:** foundation/001, foundation/002
- **Blocks:** skill-rewrites/004
