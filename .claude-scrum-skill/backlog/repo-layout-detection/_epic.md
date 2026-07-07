---
title: Repo-layout detection
slug: repo-layout-detection
status: closed
created: 2026-07-07T00:00:00Z
---

# Repo-layout detection

`detect_repo_layout.mjs` (tracked-vs-untracked axis) + strategy resolution wiring
in `sprint_pipeline.js`, optional `isolationStrategy` override, and holistic
SKILL.md reconciliation. Depends on args-normalization-extraction. See CONTEXT.md.

## Stories

- [x] 001 — Create `_shared/detect_repo_layout.mjs` (F8/F9/F9a) + colocated `.test.mjs` (E2, 7 cases against real temp git repos).
- [x] 002 — Strategy resolution wiring (F5/F9b/F10). Landed with serial-in-tree-execution because it edits the same `runStory`/story-loop region; splitting would ship a racy intermediate. Detection classifier is inlined; git delegated to an agent.
- [x] 003 — SKILL.md reconciliation: added optional `isolationStrategy` to the args block and rewrote the stale worktrees/`min(16,cpu_cores-2)`/lock paragraph into the two-execution-model description (F9c).
