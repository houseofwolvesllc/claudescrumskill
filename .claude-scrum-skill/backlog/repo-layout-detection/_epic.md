---
title: Repo-layout detection
slug: repo-layout-detection
status: open
created: 2026-07-07T00:00:00Z
---

# Repo-layout detection

`detect_repo_layout.mjs` (tracked-vs-untracked axis) + strategy resolution wiring
in `sprint_pipeline.js`, optional `isolationStrategy` override, and holistic
SKILL.md reconciliation. Depends on args-normalization-extraction. See CONTEXT.md.

## Stories

- [ ] 001 — Create `_shared/detect_repo_layout.mjs` (F8/F9/F9a) + colocated `.test.mjs` (E2).
- [ ] 002 — Resolve strategy once after empty-batch guard; optional override + forced-worktree warning; log evidence (F5/F9b/F10).
- [ ] 003 — SKILL.md reconciliation: args block + stale worktrees/concurrency/lock paragraph (F9c).
