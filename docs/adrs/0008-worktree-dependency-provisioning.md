# ADR-0008: A Worktree Earns Parallelism by Obtaining Dependencies, Not by Having Them Tracked

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Keith Garcia (project owner)

## Context

`sprint_pipeline.js` has supported parallel story execution since v2.0.0: stories run
concurrently in their own `git worktree`, fanning into the release branch behind a
serialized merge lock. That machinery was built, tested, and almost never executed.

One line decided it:

```js
return String(lsFilesStdout ?? '').trim().length > 0 ? WORKTREE : SERIAL_IN_TREE
```

That is `git ls-files node_modules`. Worktree mode was selected only when dependencies
were **vendored into git**, because `git worktree add` materializes tracked files only.
Almost nobody vendors, so almost every run went serial — paying N sequential story
chains for a capability that already existed.

## Decision

### 1. The gate asks whether dependencies can be obtained

`classifyIsolationStrategy` now takes the viable provisioning strategies and selects
worktree mode whenever one exists. Tracked dependencies remain a fast path; the absence
of them is no longer disqualifying.

The reframing is the whole ADR. Everything else follows from it.

### 2. Four strategies, because the axis is real and closed

`assume-present`, `clone`, `install`, `symlink` — differing in isolation, validation, and
cost. Only `install` **validates**: it proves the tree matches a clean install, so a story
that adds a dependency without updating the lockfile fails during the story rather than
passing silently and breaking CI later.

### 3. Story-aware escalation is the design's centre

`clone` by default for speed; escalate to `install` for any story touching `package.json`
or a lockfile. Validation lands exactly where dependency correctness is at stake, and the
roughly 90% of stories that never touch dependencies pay near-zero.

The cost objection — minutes and gigabytes per worktree — is weaker than it appears,
because **install is paid once in parallel while serial-in-tree is paid sequentially per
story.** At 8 stories and ~7 min/chain, that is ~56 min serial against ~9 min parallel.

### 4. Refuse rather than silently degrade

`clone` falls back to `install` where the filesystem has no copy-on-write support, never
to the expensive recursive copy it exists to avoid. `symlink` fails loud — naming the
offending story — when a batch contains a dependency-touching story, because one story
running an install would corrupt its siblings mid-run.

A caller who asked for `symlink` and silently got something else has been given wrong
information about their own run. Both refusals are correctness properties.

### 5. Report, do not silently correct

Post-hoc reconciliation **reports** a story that touched dependency files without having
been escalated. It does not re-provision. A silent correction would hide a detection gap
that recurs; the report is the deliverable.

## Consequences

**Positive.** Parallel execution becomes reachable on ordinary repos. Fan-out is bounded
by disk as well as cores, with the binding constraint logged. Dependency setup failure
reports `infrastructure-failed` rather than `failed`, so nobody hunts a phantom code bug.
Story branches are namespaced per epic, closing a collision two concurrent runs already hit.

**Negative.** Four strategies is four code paths with four sets of preconditions. The
disk bound is a heuristic, not a guarantee — a pathological dependency tree can still
surprise it.

**Risk accepted.** `clone` inherits the parent tree's dependency directory, which may not
equal a clean install. That is the price of its speed, and the escalation rule is the
mitigation.

**Unmeasured.** This repo has zero dependencies, so no install cost could be measured
here. The wall-clock figures are extrapolations from a measured 3-story serial run.

## On the named pattern

The spec named a candidate Gang of Four **Strategy** for the four mechanisms — the first
time this suite named one rather than declining. It was recorded in the required
non-binding form, and **it did not survive contact**: the resolver shipped as twelve plain
functions over a `PROVISIONERS` dispatch table, zero classes.

That is the pattern-naming discipline working. Naming records a hypothesis; the
Arbitration Rule decides. A spec that could only ever confirm its own patterns would be
worth less than one that can be falsified by the implementation.

## Future work

**Cross-epic parallelism** — concurrent `release/<epic>` branches fanning into
`development` — is explicitly out of scope. It is an orchestrator change rather than a
pipeline one: multiple live release branches, fan-in ordering, and inter-epic conflicts.
The larger prize on a wide PRD, and the next thing to spec.

The **shared `.claude-scrum-skill/` state directory** lives outside every worktree and is
written by every arm. It is the next contention point under true parallelism.

## References

- Spec: `docs/specs/20260816_021405_worktree_dependency_strategy.md`
- Builds on ADR-0007 (model-coupled prompt surface) and ADR-0006 (workflow execution robustness)
