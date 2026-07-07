---
title: Serial-in-tree execution
slug: serial-in-tree-execution
status: closed
created: 2026-07-07T00:00:00Z
---

# Serial-in-tree execution

Net-new serial-in-tree path: topological order, dependency-preserving reset, and
the extracted sequential driver, plus the two-execution-model restructure of
`sprint_pipeline.js`. Depends on repo-layout-detection. See CONTEXT.md.

## Stories

- [x] 001 — `_shared/topological_order.mjs` (Kahn, throws on cycle) + test (E3, 8 cases incl. adverse + cycle).
- [x] 002 — `_shared/reset_worktree.mjs` (exact reset order, deps preserved) + test (E4, real temp repo, conflicting dirty tracked file).
- [x] 003 — `_shared/run_sequential.mjs` (one-in-flight driver) + test (E5, order/single-in-flight/between-pair reset/termination).
- [x] 004 — Two-model restructure of `runStory`/story loop; strategy resolution (F5/F9b/F10) via an agent-run detection + inlined classifier; conditional Implement/Verify prompts; omit worktree isolation and drop the lock in serial mode (F7/F7a–d). Fully-inlined script runtime-verified (empty-batch parse smoke).
