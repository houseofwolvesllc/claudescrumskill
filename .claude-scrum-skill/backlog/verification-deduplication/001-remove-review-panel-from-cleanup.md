---
title: Remove review_panel from the project-cleanup flow
epic: verification-deduplication
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:verification-deduplication
persona: impl
---

## Objective

Remove review_panel from the project-cleanup flow

## Acceptance Criteria

- [ ] project-cleanup/SKILL.md Phase 5.5 no longer invokes review_panel.js, or invokes it scoped strictly to files the per-story review flagged
- [ ] Security-lens coverage is preserved: either the security lens prompt is folded into buildReviewPrompt, or a single scoped security lens is retained with a written rationale
- [ ] No orphaned references to review_panel.js remain in any SKILL.md
- [ ] If review_panel.js becomes unreferenced, the file is deleted rather than left in place

## Technical Context

review_panel.js runs 4 lens agents (correctness, security, style, tests) over the same diff the per-story review agent at sprint_pipeline.js:621 already covered. Invoked from project-cleanup/SKILL.md:308.
