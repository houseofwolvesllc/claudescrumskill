# Emulation Issues — Orchestrator Claim Verification (v2.6.0)

**Date:** 2026-08-20
**Scope:** full project, post-change
**Baseline:** v2.5.0

## Summary

| Severity | Raised | Survived |
|---|---:|---:|
| Critical | 0 | 0 |
| Warning | 1 | **1 — fixed** |
| Info | 1 | 0 |

## EM-201 — dead freshness module (CONFIRMED, fixed)

`artifactIsFresh` was defined in the `_shared/` module, inlined into
`sprint_pipeline.js` (41 lines), registered in `inline_manifest.mjs` — and
**called from nowhere**. Zero report-path references in the pipeline.

The verify agent for this finding hit the StructuredOutput retry cap and returned
no verdict, so it was resolved on the merits rather than treated as passed.

**What was actually true:** the Phase 2/3 gate *is* enforced — SKILL.md gives the
orchestrator a concrete `stat` command and exact handling for at-or-after /
before / missing. The runtime cannot read a filesystem (ADR-0006), so the gate
necessarily lives in the skill, not the workflow. The module duplicated that
logic where it could never reach the data.

**Fix:** removed from the inline manifest and excised from the pipeline. The
module and its 13 tests stay as the executable specification of the gate's
semantics — `modified >= started`, matching SKILL.md's "at or after" verbatim,
failing closed on stale, missing, and unparseable timestamps.

## EM-202 — reconciliation logs rather than failing the batch (dismissed)

**Verdict: not real, high confidence.** FR-5 specified "reports any absence
loudly," which shipped in full. The premise — a consumer reading only the return
value — describes a JSON-only caller that does not exist; the caller is Claude
Code reading `log()` output in-band, the same channel the pipeline already uses
for every cross-cutting warning.

One narrower point survives and is recorded as follow-up: SKILL.md Step 3
iterates the return without instructing the orchestrator to act on the
reconciliation line, unlike the explicit Phase 2/3 gates. That belongs with the
deferred F8 work (citing orchestrator claims), already an explicit non-goal.

## Note on method

Both findings were authored by the orchestrator. One was confirmed and fixed;
one was refuted. The confirmed one is the same shape as the release it belongs
to: something that looked like a check but was not reachable.
