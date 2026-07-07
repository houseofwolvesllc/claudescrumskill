---
title: End-to-end emulation & verification
slug: end-to-end-emulation-and-verification
status: closed
created: 2026-07-07T00:00:00Z
---

# End-to-end emulation & verification

Aggregate E1–E5 as the automated release gate (`node --test` green) and author
the documented manual end-to-end gate M1. Does NOT re-author the per-module unit
tests. Depends on the three implementation epics.

## Stories

- [x] 001 — Integration gate: `npm test` (node --test) green, 65 checks covering
  E1–E5 + F11 install + the inline drift guard. Two runtime smokes executed: the
  inlined `normalizeArgs` and the fully-inlined `sprint_pipeline.js` (empty-batch)
  both load and run in the real wrapped-eval Workflow runtime.
- [x] 002 — `docs/M1-manual-e2e-gate.md` authored with exact reproducible steps
  (≥2-story serial batch: independent pair, adverse dependency pair, dirty-tree
  carryover, forced override both directions, simulated detector throw). Left as
  the documented MANUAL gate by design: a full agent-driven run targets the
  ambient session repo (agents inherit session cwd), so it must be run in a
  dedicated scratch-repo session — reconstructing the runtime in CI is a non-goal.
