---
title: Serial-in-tree execution
slug: serial-in-tree-execution
status: open
created: 2026-07-07T00:00:00Z
---

# Serial-in-tree execution

Net-new serial-in-tree path: topological order, dependency-preserving reset, and
the extracted sequential driver, plus the two-execution-model restructure of
`sprint_pipeline.js`. Depends on repo-layout-detection. See CONTEXT.md.

## Stories

- [ ] 001 — `_shared/topological_order.mjs` (Kahn, throws on cycle) + test (E3).
- [ ] 002 — `_shared/reset_worktree.mjs` (exact reset order, deps preserved) + test (E4).
- [ ] 003 — `_shared/run_sequential.mjs` (one-in-flight driver) + test (E5).
- [ ] 004 — Two-model restructure of `runStory`/story loop; conditional prompts; omit worktree isolation in serial mode (F7/F7a–d).
