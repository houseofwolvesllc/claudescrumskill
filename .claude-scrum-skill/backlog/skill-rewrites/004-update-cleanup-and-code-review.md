---
title: Update project-cleanup + code-review to use review_panel.js
epic: skill-rewrites
status: done
executor: claude
priority: P1-high
points: 3
labels: [type:story, executor:claude, P1-high, epic:skill-rewrites, ready-for-work]
persona: impl
blocked_by: [workflow-scripts/005]
blocks: [release/001]
sprint: 3
---

## Objective

Rewrite the review gates in `/project-cleanup/SKILL.md` and `/code-review` to invoke review_panel.js. Multi-lens verdicts replace single-pass review. FR-25.

## Acceptance Criteria

- [ ] /project-cleanup review gate invokes review_panel.js
- [ ] /code-review invokes review_panel.js
- [ ] Aggregated verdict drives merge/block decisions
- [ ] Per-lens verdicts surfaced in output

## Dependencies
- **Blocked by:** workflow-scripts/005
- **Blocks:** release/001
