# Worktree Dependency Strategy — Specification

## Overview

`sprint_pipeline.js` already supports parallel story execution. Worktree mode runs stories concurrently up to `min(16, cores − 2)`, each in its own `git worktree`, with per-story merges into the release branch serialized behind a lock. That machinery is built, tested, and almost never reached.

The reason is a single line in `lib/workflows/_shared/detect_repo_layout.mjs`:

```js
return String(lsFilesStdout ?? '').trim().length > 0 ? WORKTREE : SERIAL_IN_TREE
```

That is `git ls-files node_modules`. Worktree mode is selected **only when `node_modules` is vendored into git** — because `git worktree add` materializes tracked files only, so an untracked `node_modules` leaves every fresh worktree dependency-empty and every build fails. Almost nobody vendors, so almost everybody gets serial.

**The gate asks the wrong question.** It asks *"are dependencies already tracked?"* when it should ask *"can this worktree **get** dependencies?"* Answering the second question unlocks parallelism that already exists.

### Why the cost objection is weaker than it looks

The instinctive objection to per-worktree installs is minutes and gigabytes each. But **install is paid once in parallel; serial-in-tree is paid sequentially per story.**

Measured on this repo: a 3-story sprint serial-in-tree took 18–22 minutes, roughly 6–7 minutes per story chain. Extrapolating to 8 stories with a 2-minute install:

| | Wall clock |
|---|---|
| serial-in-tree | 8 × 7 = **56 min** |
| worktree + install | ~2 + 7 = **9 min** |

Install is 22% of the parallel run and saves 47 minutes. Even if I/O contention triples the install to 6 minutes for 8 concurrent worktrees, the run is 13 minutes — still 4×.

And on this machine (APFS, darwin) there is a cheaper option than either: a copy-on-write clone of a 200 MB tree takes **5 ms** against 59 ms for a real copy, measured. On `node_modules` the gap widens sharply, because `clonefile` is metadata-only while `cp -R` pays per file.

## Objectives

**Primary**

- Make worktree mode reachable on a repo with untracked `node_modules`.
- Give each worktree its dependencies by a strategy chosen for the batch, not assumed.
- Validate dependency correctness where it actually matters — stories that change dependencies.

**Secondary**

- Bound fan-out by disk as well as cores.
- Separate infrastructure failure from code failure in story outcomes.
- Remove the story-branch namespace collision that concurrent runs already hit.

## Ubiquitous Language

| Term | Meaning |
|---|---|
| **Dependency strategy** | How a fresh worktree obtains its dependency directory |
| **Viable strategy** | One whose preconditions hold for this repo, filesystem, and batch |
| **Escalation** | Choosing a stronger strategy for one story than the batch default |
| **Validating strategy** | One that proves the tree matches a clean install (`install` alone) |
| **Infrastructure failure** | A story that failed to set up, distinct from one whose code failed |

## Requirements

### Functional

**FR-1 — Add a `dependencyStrategy` argument.** Four values. The default preserves today's behaviour exactly.

| Value | Mechanism | Isolated | Validates | Cost |
|---|---|---|---|---|
| `assume-present` | nothing; worktree is expected to have what it needs | n/a | no | zero |
| `clone` | copy-on-write clone from the main tree | yes (CoW diverges on write) | **no** | near-zero |
| `install` | the project's clean-install command | yes | **yes** | minutes + GB |
| `symlink` | symlink to the main tree's directory | **no** — shared mutable state | no | zero |

`assume-present` is the default when `node_modules` is tracked, which is exactly current behaviour.

**FR-2 — `clone` must not silently degrade.** On a filesystem without copy-on-write support, `cp -c` either fails or falls back to a real copy depending on platform. A real copy of `node_modules` is expensive and slow — precisely what the strategy exists to avoid. When CoW is unavailable, fall back to **`install`** and log the substitution. Never perform a silent expensive copy.

**FR-3 — `symlink` must refuse an unsafe batch.** A symlinked `node_modules` is shared mutable state across concurrent stories: one story running an install corrupts its siblings mid-run. When any story in the batch is identified as touching `package.json` or a lockfile, `symlink` **fails loud** and names the offending story. It must not silently downgrade to a safer strategy — a caller who asked for `symlink` and got something else has been given wrong information about their run.

**FR-4 — The strategy is story-aware, and this is the design's centre.** Default to `clone` for speed, and **escalate to `install` for any story that touches `package.json` or a lockfile.**

That gives clean-install validation exactly where dependency correctness is at stake, and clone speed for the roughly 90% of stories that never touch dependencies. Under `install`, a story that adds a dependency without updating the lockfile **fails** — which is the correct outcome, and one that `clone` and `symlink` would both pass silently before breaking CI later.

Detection runs **before** the story, from its declared surface (`technical_context`, `acceptance_criteria`). Where cheap, reconcile **after** from `git diff --name-only`: if a story touched dependency files without having been escalated, **report the mismatch** rather than silently re-installing. The report is the deliverable — a silent correction hides a detection gap that will recur.

**FR-5 — Rewrite the isolation gate.** `classifyIsolationStrategy` must select worktree mode when a viable `dependencyStrategy` exists, and fall back to serial-in-tree only when none does. Preserve the existing `isolationStrategy` override semantics, including the forced-worktree warning, whose wording becomes *"forced worktree with `dependencyStrategy=assume-present` over untracked deps"*.

**FR-6 — Detect the package manager.** Resolve from the lockfile present: npm (`npm ci`), pnpm, yarn, bun. Do not assume npm.

**Note on pnpm:** its content-addressable store already makes per-worktree installs cheap, so on a pnpm project the resolver should prefer `install` over `clone`. The tradeoff this spec exists to manage does not apply there.

**FR-7 — Bound concurrency by disk.** The existing cap is `min(16, cores − 2)`. Sixteen worktrees times a large `node_modules` is many gigabytes of transient disk. Add a disk-aware bound so a full fan-out cannot exhaust the volume, and **log which constraint bound the run** (cores or disk) so a slow run is diagnosable rather than mysterious.

**FR-8 — Distinguish infrastructure failure from code failure.** A worktree whose dependency setup fails must report a distinct outcome. Today `status: failed` means *the story's code did not work*; reusing it for a failed install sends someone hunting a phantom bug. That is the failure mode to design out.

**FR-9 — Namespace story branches per epic.** Move from `story/<story-slug>` to `story/<epic-slug>/<story-slug>`, updating every place a story branch is constructed, matched, or cleaned up.

This is not hypothetical. Two concurrent runs in this repo both wanted `story/document-credential-resolution`, and afterwards the ref pointed at whichever finished last — the collision was found by a contaminated measurement, not by a test. Parallel epics with similarly-named stories collide identically.

### Non-Functional

- **NFR-1 — Backward compatible.** A caller that passes no `dependencyStrategy` behaves exactly as today.
- **NFR-2 — Fail loud, never silently degrade.** Every substitution (CoW unavailable, strategy refused, cap lowered) is logged with its reason.
- **NFR-3 — Inline sync preserved.** Any new `_shared/` module is inlined into the consuming scripts per the existing `inline_manifest` convention.
- **NFR-4 — Teardown.** Cloned and installed dependency directories are transient; worktree removal must reclaim them.

## Explicit Non-Goals

- **Cross-epic parallelism** — multiple concurrent `release/<epic>` branches fanning into `development`. That is a larger orchestrator change and belongs in its own spec. Recorded as future work.
- Changing the merge serialization lock.
- Adding verification steps or double-check phrasing.
- Pinning model IDs.

## Design Passes

### Subdomain classification

| Epic | Subdomain | Reasoning |
|---|---|---|
| `dependency-provisioning` | core | Real invariants that must compose: isolation, validation, and refusal conditions. Choosing wrongly corrupts concurrent stories or passes broken lockfiles. |
| `parallel-run-safety` | supporting | Necessary for parallel runs to be trustworthy — disk bounds, failure classification, branch namespacing — but not the differentiating logic. |

### Pattern-naming pass

> **Strategy — because dependency provisioning genuinely varies along an axis that is known and closed (`assume-present` / `clone` / `install` / `symlink`), each with different preconditions, costs, and refusal conditions; revisit at build (may collapse to a function over a constant map if the four cases prove to share enough structure).**

This is the first place in the suite where a GoF pattern has been named rather than declined. The earlier tiering work declined one because two override rules is not an axis of variation. Here there are four genuinely different mechanisms with different preconditions — but the Arbitration Rule still applies: if the four collapse to a dispatch table plus four small functions, that is the right answer and the pattern name was a hypothesis that did not survive contact.

## Implementation Plan

1. **`dependency-provisioning`** — FR-1 through FR-6. The strategies, their preconditions, escalation, the rewritten gate, and package-manager detection.
2. **`parallel-run-safety`** — FR-7, FR-8, FR-9. Disk bounds, failure classification, branch namespacing. Independent of (1) and safe to run in parallel with it, though both touch `sprint_pipeline.js`.

## Testing Strategy

- **Unit** — strategy resolution across the matrix of filesystem support, tracked/untracked `node_modules`, package manager, and per-story escalation triggers. The refusal conditions are the highest-value cases: `symlink` + dependency-touching story, and `clone` + no CoW.
- **Structural** — no story branch is constructed without its epic prefix.
- **Regression** — `inline_sync.test.mjs` passes for any new `_shared/` module; existing serial-in-tree behaviour is unchanged when no `dependencyStrategy` is supplied.
- **Acceptance** — the five conditions in the section below, each as a test.

## Acceptance

- A repo with untracked `node_modules` runs stories in parallel worktrees.
- A story that adds a dependency without updating the lockfile **fails** under `install`.
- `symlink` **refuses** a batch containing a `package.json`-touching story, naming it.
- A filesystem without CoW falls back to `install` rather than a silent expensive copy.
- Concurrency is bounded by disk as well as cores, and the binding constraint is logged.

## Risks

| Risk | Mitigation |
|---|---|
| Concurrent installs contend for I/O and scale sublinearly on one disk | The package cache is shared, so most reads are local after the first. Disk-aware cap bounds the worst case. Accepted: parallel-but-sublinear still beats sequential. |
| Monorepo workspace hoisting — a per-worktree install is the whole tree, a clone is all-or-nothing | Detect workspaces and prefer `clone`; record as a known limitation rather than solving it here. |
| `.claude-scrum-skill/` state lives outside all worktrees and is written by every arm | Out of scope for this spec, but it is the next thing that breaks under true parallelism. Flagged as future work. |
| Undeclared file overlap between stories merge-conflicts at fan-in | `blocked_by` covers declared dependencies only. Unchanged by this spec; the serialized merge surfaces the conflict rather than corrupting. |
| Escalation detection misses a dependency-touching story | FR-4's post-hoc reconciliation reports the mismatch. Reporting beats silent correction: a silent fix hides a detection gap that will recur. |

## Future Considerations

- **Cross-epic parallelism** — concurrent `release/<epic>` branches fanning into `development`. Larger prize than intra-epic parallelism on a multi-epic PRD, and a change to the orchestrator rather than the pipeline.
- **Shared state under parallelism** — `.claude-scrum-skill/` (backlog, reports, orchestration state) is written by every arm and is the next contention point.
- **Measured install cost** — this repo has zero dependencies, so `npm ci` here is instantaneous and proves nothing. The figures in the Overview are extrapolations from a measured 3-story serial run, not measured installs. A repo with a real dependency tree would let the disk cap and contention factor be tuned against data.
