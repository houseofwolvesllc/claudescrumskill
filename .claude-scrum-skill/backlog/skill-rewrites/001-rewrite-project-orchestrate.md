---
title: Rewrite project-orchestrate Phase 1 Step 3 + Sequential Multi-Path Mode
epic: skill-rewrites
status: backlog
executor: claude
priority: P1-high
points: 5
labels: [type:story, executor:claude, P1-high, epic:skill-rewrites, ready-for-work]
persona: impl
blocked_by: [workflow-scripts/001, workflow-scripts/003]
blocks: [release/001, release/002]
sprint: null
---

## Objective

Rewrite `/project-orchestrate/SKILL.md` Phase 1 Step 3 (Story Execution) and Sequential Multi-Path Mode to invoke sprint_pipeline.js and multi_spec_queue.js via the Workflow tool. Delete the verbose Task-spawning prose. Add Workflow-availability check to Before You Start. FR-21, FR-22, FR-28.

## Acceptance Criteria

- [ ] Phase 1 Step 3 invokes sprint_pipeline.js via Workflow tool with scriptPath resolution per the Path Resolution Algorithm
- [ ] Sequential Multi-Path Mode invokes multi_spec_queue.js
- [ ] Before You Start gains item 0 (Workflow availability check)
- [ ] Path Resolution Algorithm documented inline or referenced
- [ ] Verbose Task-spawning prose deleted
- [ ] NFR-6: line count reduces by ≥30% (target: <770 lines)

## Dependencies
- **Blocked by:** workflow-scripts/001, workflow-scripts/003
- **Blocks:** release/001, release/002
