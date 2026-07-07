---
title: Args-normalization extraction
slug: args-normalization-extraction
status: open
created: 2026-07-07T00:00:00Z
---

# Args-normalization extraction

One shared `normalize_args.mjs` (single source of truth) inlined into all four
workflow entry points; installer skip-predicate keeps colocated tests out of the
payload. Depends on runtime-behavior-spikes. See CONTEXT.md.

## Stories

- [ ] 001 — Create `_shared/normalize_args.mjs` (F1–F1e) + colocated `.test.mjs` (E1).
- [ ] 002 — Create `_shared/inline_sync.mjs` (stripExports/extractInlinedBlock) + drift test.
- [ ] 003 — Inline `normalizeArgs` into all four scripts and route `args` through it (F2).
- [ ] 004 — Installer skip-predicate + migrate exact-path caller + post-install smoke check (F11).
