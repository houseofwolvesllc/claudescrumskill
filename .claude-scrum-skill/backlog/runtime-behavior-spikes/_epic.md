---
title: Runtime-behavior spikes
slug: runtime-behavior-spikes
status: closed
created: 2026-07-07T00:00:00Z
epic_type: design-spike
---

# Runtime-behavior spikes (GATING)

Resolves the two runtime spikes that gate all feature implementation. Produces
`docs/adrs/0006-workflow-execution-robustness.md` and the per-epic CONTEXT.md
files. Every other epic depends on this one.

## Stories

- [x] 001 — Resolve S1 (does `isolation:'worktree'` overlay untracked files?).
  **Finding: NO** — plain `git worktree add`, tracked files only; untracked
  `node_modules` absent → Defect 2 real, no scope collapse.
- [x] 002 — Resolve S2 (dynamic-import relative-specifier resolution).
  **Finding: NEGATIVE** — `import()` unavailable; `require`/`process` undefined;
  no runtime module loading and no `child_process`. Adopt S2-negative branch:
  inline shared logic from one canonical `.mjs` + drift test; delegate git to
  `agent()`.
- [x] 003 — Author ADR-0006 and the three implementation-epic CONTEXT.md files.
