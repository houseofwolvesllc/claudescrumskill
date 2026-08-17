---
title: Bound concurrency by available disk as well as cores
epic: parallel-run-safety
status: done
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:parallel-run-safety
persona: ops
---

## Objective

Bound concurrency by available disk as well as cores

## Acceptance Criteria

- [ ] Worktree fan-out is bounded by available disk in addition to the existing min(16, cores-2)
- [ ] A full fan-out cannot exhaust the volume
- [ ] The binding constraint (cores or disk) is logged for each run
- [ ] Unit tests cover disk-bound, core-bound, and the cap interaction

## Technical Context

The existing cap is min(16, cores - 2). Sixteen worktrees times a large node_modules is many GB. Logging which constraint bound the run turns an unexplained slow run into a diagnosable one.
