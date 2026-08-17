# Emulation Issues — Opus 5 Prompt Surface Retune

**Date:** 2026-08-07
**Scope:** full project, post-retune (development @ 68644a5)
**Baseline:** tag `opus-4-8` @ fb67d42

## Summary

| Severity | Raised | Survived verification |
|---|---:|---:|
| 🔴 Critical | 0 | 0 |
| 🟡 Warning | 2 | **0** |
| 🔵 Info | 1 | **0** |

**No actionable findings.** Three candidates were raised during seam validation and all
three were refuted by skeptic/judge verification at high confidence. No hardening PRD is
generated; the run proceeds to Project Cleanup.

## Seam validation

| Seam | Result |
|---|---|
| `review_panel.js` dangling references in `skills/`, `lib/`, `test/` | clean |
| `adversarial_verify` return shape vs. SKILL.md contract | agree — `{finding, skeptic, verdict}` |
| `resolve_agent_tier.mjs` inline sync across 3 scripts | in sync; `sessionModel` threaded in all three |
| `ENGINEERING_BASELINE.md` referencing sites | resolve and read coherently |
| Cross-references (Steps 1–17 in project-orchestrate) | every cited step exists |
| Fixture PRD workflow-exercise list | correctly updated |
| Install payload contract | no hard-coded workflow counts |

Not applicable to this repo and correctly skipped: Docker/compose seams, build-tool CWD,
IoC container integrity, cross-service payload contracts, response-format and
middleware-chain contracts. This is a markdown-and-Node skill suite with no service
boundaries or DI container.

## Dismissed (false positives)

### EM-001 — Baseline described by content it no longer restates
**Verdict:** not real, high confidence.
Three sites introduce `ENGINEERING_BASELINE.md` with a parenthetical naming Clean Code and
TDD. The reduction removed those sections. Refuted because every one of those sites states
the obligations inline in the same sentence — `sprint_pipeline.js:511` continues "Follow it
for all code: write tests first (red-green-refactor)…", and `project-spec/SKILL.md:51-53`
continues "The spec must assume this baseline: acceptance criteria assume tests-first…".
The postulated failure (agent concludes guidance is missing) cannot produce a behavioral
delta when the guidance is in the same prompt line. The file's own header explains the
absence. Additionally `test/engineering_baseline.test.js` fails the build if the canon is
restated, so the implied remedy is prohibited by a passing test.

### EM-002 — ADR-0003 documents the deleted `review_panel.js`
**Verdict:** not real, high confidence.
Refuted on two grounds. First, ADR-0003's reference list has been non-current since
acceptance — it lists `multi_spec_queue.js`, which never existed, and the same ADR explains
at line 35 why it was never built. `review_panel.js`'s absence is the same class of dated
record. Second, the finding's blocker ("ADRs are immutable") is contradicted by project
precedent: ADR-0006 carries an in-place amendment.

### EM-003 — Stale generated reports assert `review_panel.js` exists
**Verdict:** not real, high confidence.
Both artifacts are self-stamped point-in-time records (cleanup report dated 2026-05-30;
discovery report stamped v2.1.3 on a prior release branch) and were true of the tree they
describe. The live invariant is machine-enforced by `test/workflow_references.test.js`,
which asserts bidirectionally that every SKILL.md-invoked workflow ships and every shipped
workflow is invoked.

## Note on method

All three findings were authored by the orchestrator from static seam analysis, and all
three were refuted. The verification stage is doing its job: it caught two factual errors
in the orchestrator's own premises (the test that prohibits EM-001's remedy, and the ADR
amendment precedent that invalidates EM-002's blocker).
