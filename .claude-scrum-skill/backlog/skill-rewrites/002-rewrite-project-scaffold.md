---
title: Rewrite project-scaffold Two-Pass Pass 2
epic: skill-rewrites
status: done
executor: claude
priority: P1-high
points: 3
labels: [type:story, executor:claude, P1-high, epic:skill-rewrites, ready-for-work]
persona: impl
blocked_by: [workflow-scripts/002]
blocks: [release/001, release/002]
sprint: 3
---

## Objective

Rewrite `/project-scaffold/SKILL.md` Two-Pass Procedure Pass 2 to invoke elaborate_epics.js via Workflow tool. Pass 1 narration unchanged (single agent, no fan-out). FR-23.

## Acceptance Criteria

- [ ] Pass 2 invokes elaborate_epics.js with scriptPath resolution
- [ ] Verbose Pass 2 Task-spawning prose deleted
- [ ] Pass 1 (skeleton extraction) prose unchanged
- [ ] Story Assembly + Failure Handling reference workflow return shapes

## Dependencies
- **Blocked by:** workflow-scripts/002
- **Blocks:** release/001, release/002
