---
title: Args-normalization extraction
slug: args-normalization-extraction
status: closed
created: 2026-07-07T00:00:00Z
---

# Args-normalization extraction

One shared `normalize_args.mjs` (single source of truth) inlined into all four
workflow entry points; installer skip-predicate keeps colocated tests out of the
payload. Depends on runtime-behavior-spikes. See CONTEXT.md.

## Stories

- [x] 001 — Create `_shared/normalize_args.mjs` (F1–F1e) + colocated `.test.mjs` (E1, 12 cases).
- [x] 002 — Create `_shared/inline_sync.mjs` + `inline_manifest.mjs` + `bin/regen_workflow_inlines.mjs` + drift test.
- [x] 003 — Inline `normalizeArgs` into all four scripts and route `args` through it (F2). Runtime-smoke verified in the real Workflow runtime.
- [x] 004 — Installer skip-predicate (`copyRecursive` predicate) + migrate exact-path caller + post-install smoke check `verifyWorkflowInstall` (F11).
