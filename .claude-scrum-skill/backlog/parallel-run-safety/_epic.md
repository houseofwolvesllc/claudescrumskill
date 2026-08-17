---
title: Parallel Run Safety
slug: parallel-run-safety
status: open
created: 2026-08-17T18:20:51Z
subdomain: supporting
---

# Parallel Run Safety

The safety work true parallelism requires, independent of how dependencies arrive. Bound fan-out by available disk rather than cores alone, since sixteen worktrees times a large dependency tree is many gigabytes of transient disk. Report a worktree that failed to set up as an infrastructure failure rather than a code failure, so nobody hunts a phantom bug. And namespace story branches per epic, closing a collision that concurrent runs in this repo already hit.

## Shared Design Concerns

- Log which constraint bound the run so a slow run is diagnosable rather than mysterious
- Cloned and installed dependency directories are transient; worktree teardown must reclaim them
- Do not change the merge serialization lock
