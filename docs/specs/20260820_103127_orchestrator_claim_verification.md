# Orchestrator Claim Verification — Specification

## Overview

A 46-story production run of `/project-orchestrate` (claude-scrum-skill 2.4.0, npm workspaces monorepo, ~9,700 tests) delivered 45 of 46 stories. Its debrief made an observation worth acting on:

> Nine of twelve findings share one shape: **the harness had the information needed to catch the problem and did not check.** The skill is good at deciding *what work to do next*. It currently does almost nothing to verify that what it just claimed happened, happened. For an autonomous, unpaused run — which is what this was, by explicit instruction — that gap is the whole ballgame.

This spec implements the three cheapest, highest-value items from that debrief. Together they cost roughly **one flag, one manifest check, and one file timestamp**, and they address the findings that consumed the most of that run.

| Finding | Cost in the run |
|---|---|
| **F1** — agent placed in a worktree that did not hold the commit under test | ~12 occurrences, ≥4 false BLOCKED reports, ~14 cascaded blocks |
| **F3** — "empty" and "unreachable" rendered as the same sentence | turned F1 from one incident into twelve |
| **F6** — work reported launched that was never launched | twice; once a whole epic, once 7 of 14 stories |
| **F7** — phase completion self-attested | emulation and cleanup both claimed, neither run |

## Objectives

**Primary**

- Point verification at a commit rather than a branch name, so it cannot be locked out of the tree it must read.
- Make a wrong tree structurally distinguishable from an empty one.
- Make a story's absence from the results detectable rather than invisible.
- Mark artifact-producing phases complete by the artifact, not by attestation.

**Secondary**

- Reuse the `infrastructure-failed` vocabulary added in 2.4.0 rather than inventing a second failure language.

## Ubiquitous Language

| Term | Meaning |
|---|---|
| **Tree identity** | That the working tree an agent reads is the one it was assigned, provable by `git rev-parse HEAD` |
| **Launch receipt** | The set of story IDs a dispatch actually returned results for |
| **Phase artifact** | A file a phase writes as its by-product — the emulation and cleanup reports |
| **Artifact freshness** | Whether an artifact's mtime postdates the phase start |
| **Self-attestation** | A phase marked complete because the orchestrator said so |

## Requirements

### Functional

**FR-1 — Verification detaches at an explicit commit.** `buildVerifyPrompt` currently instructs the agent to `git checkout ${branch}`. A branch **ref** is locked to one worktree; a **commit** is not. When the implement stage holds that branch, verify's checkout fails and the agent is left reading a tree that does not contain the work.

Verify is instead given the implement stage's head SHA and instructed to `git checkout --detach <sha>`. The implement stage already returns commit SHAs in its structured result; thread the head SHA through.

**FR-2 — Tree identity is asserted before content is reported.** The verify agent must confirm `git rev-parse HEAD` equals the SHA it was given **before** reporting anything about files. On mismatch it reports a tree-identity failure and stops.

This is what makes F3 structural instead of a matter of phrasing. *"`src/` is completely empty"* and *"I cannot read the tree I was pointed at"* are different diagnoses; the first sent the run hunting a story that had failed to write files, repeatedly, for days.

**FR-3 — The observed SHA is carried in the return, not just the prose.** The verify return schema gains the SHA the agent actually observed, so a mismatch is visible in structured data rather than only in narrative. A content finding from an agent that never asserted tree identity must be distinguishable from one that did.

**FR-4 — A wrong tree is an infrastructure failure.** Reuse `infrastructure-failed`, added in 2.4.0. A verify agent on the wrong tree has not discovered that the code is broken; it has discovered that the harness put it in the wrong place. Inventing a second failure vocabulary for the same category would fragment the one that already exists.

**FR-5 — Launch receipts.** The pipeline returns one entry per story, but **nothing compares the returned set against the requested set** — so a silently dropped or truncated batch is indistinguishable from a completed one. That is exactly how 7 of 14 stories went unreported as missing.

The pipeline compares the story IDs it was asked to run against the IDs present in its results, and reports any absence loudly. A story that no agent held cannot be claimed as in flight.

**FR-6 — Artifact-based phase gating.** `/project-emulate` writes `.claude-scrum-skill/reports/emulation-report/`; `/project-cleanup` writes `.claude-scrum-skill/reports/cleanup-report/`. If the artifact's mtime predates the phase start, the phase did not run — checkable in one `stat`.

Implement as a `_shared/` helper taking a phase-start timestamp and an artifact mtime, returning whether the artifact is fresh. The Workflow runtime has no `child_process` and no filesystem access (ADR-0006), so the stat is delegated to an agent exactly as the repo-layout probe delegates its git commands. **The pure comparison stays in the module so it is unit-testable without a filesystem.**

**FR-7 — The gate binds the orchestrator's claims.** `skills/project-orchestrate/SKILL.md` Phase 2 and Phase 3 completion must be conditioned on artifact freshness, not on the orchestrator's own account of what it did.

### Non-Functional

- **NFR-1 — Backward compatible.** A caller supplying no SHA degrades to current behaviour rather than failing.
- **NFR-2 — New fields must be threaded, not merely declared.** `test/probe_schema_coverage.test.js` asserts every field read off a probe result appears in that probe's schema. It exists because three consecutive releases shipped a field nothing supplied — `sessionModel`, `viableProvisioning`, `copyOnWriteSupported` — each reading `undefined` in production while unit tests passed. Any new probe or structured return here must satisfy it.
- **NFR-3 — Inline sync preserved.** Any new `_shared/` module is inlined per the `inline_manifest` convention.

## Explicit Non-Goals

Deferred to their own specs, from the same debrief: the resource ceiling and RAM probing (F5), recursive nested `node_modules` symlinking (F4), `EnterWorktree`/`ExitWorktree` scoping (F2), quotable-anchor findings (F9), a module-ownership registry (F10), a conflict syntax gate (F11), an AC self-consistency pass (F12), and citation of orchestrator claims about repo state (F8).

Also out of scope: no verification or double-check phrasing added to any prompt; no pinned model IDs; no prose encouraging subagent delegation.

## Design Passes

### Subdomain classification

| Epic | Subdomain | Reasoning |
|---|---|---|
| `tree-identity-verification` | core | Real invariants that must compose — identity is asserted before content, and a failure to establish it is categorically distinct from a content finding |
| `claim-gating` | supporting | Bookkeeping and freshness checks; necessary for an autonomous run to be trustworthy, but not differentiating logic |

### Pattern-naming pass

**No Gang of Four pattern is named.** Each requirement is a guard clause or a comparison over two values: a SHA against a SHA, a set against a set, a timestamp against a timestamp. There is no axis of expected variation to abstract over. Per the Arbitration Rule this stays plain functions; the previous release named a candidate Strategy and the implementation falsified it, which is the discipline working — naming records a hypothesis, and there is no hypothesis here worth recording.

## Implementation Plan

1. **`tree-identity-verification`** — FR-1 through FR-4. Touches `buildVerifyPrompt`, the verify return schema, and the implement→verify SHA threading.
2. **`claim-gating`** — FR-5 through FR-7. Touches the pipeline's result reconciliation, a new `_shared/` freshness module, and `project-orchestrate/SKILL.md`. Independent of (1).

## Testing Strategy

- **Unit** — SHA comparison including the absent-SHA degradation path; requested-versus-returned set reconciliation including the truncated-batch case that motivated FR-5; artifact freshness across fresh, stale, and missing artifacts.
- **Structural** — the verify prompt instructs a detached checkout and no bare branch checkout; `probe_schema_coverage` passes for any new structured return.
- **Regression** — `inline_sync.test.mjs` passes for the new `_shared/` module; existing verify behaviour is unchanged when no SHA is supplied.

## Risks

| Risk | Mitigation |
|---|---|
| A detached HEAD confuses an agent expecting a branch | The prompt states the detachment explicitly and gives the SHA; verify does not commit, so no branch is needed |
| Artifact mtime is coarse or clock-skewed | Compare against the phase start captured in the same run; a stale artifact fails closed, which is the safe direction |
| Freshness gating blocks a legitimately-skipped phase | The gate binds only phases the orchestrator *claims* to have run; not running a phase and saying so remains available |
| The reconciliation rejects a batch that legitimately returned fewer entries | The comparison is by story ID, not count, so a blocked or failed story still counts as reported |

## Future Considerations

- The remaining nine debrief findings, F5 and F4 first — the OOM and the 65GB of orphaned worktrees were the run's other severity-1 pair, and neither disk nor RAM is bounded when the probe cannot measure them.
- The same claim-gating shape would apply to sprint release and merge: both are currently attested rather than checked.
