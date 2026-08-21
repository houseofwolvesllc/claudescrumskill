# ADR-0011: The Pipeline States the Facts It Owns

- **Status:** Accepted
- **Date:** 2026-08-20
- **Deciders:** Keith Garcia (project owner)

## Context

The PR stage is handed the whole `SprintStoryReturn` schema to fill in, so the record a
story ends up with — its slug, its branch, its status — is whatever that agent chose to
report. Two of those three were assigned by the pipeline before the agent ran.

The drift this permits was observed, not theorised. A story implemented on its own
epic-namespaced branch came back naming the release branch instead. That is not a
careless answer: the PR stage's last act is a merge, so reporting the branch it merged
*into* is a reasonable thing for it to say. It simply is not the branch the story lives
on, and the batch's own record therefore disagreed with git about where the work was.

The same run surfaced the mechanism behind a second problem. The harness parks each new
worktree on a branch of its own, `worktree-<run>-<n>`, positioned at the repository's
default branch. An implement agent moves that worktree onto its story branch, orphaning
the ref. Those refs accumulated a few per sprint. More importantly, they explain why a
stage that fails to reposition itself does not land somewhere arbitrary — it lands on
**the default branch**, silently. That is how a verify stage came to read `main` while
believing it was reading its story's code. `assert_tree_identity` (ADR-0009) caught it,
which is the only reason it surfaced as an infrastructure failure rather than a verdict.

## Decision

### 1. Facts the pipeline assigned are stated by the pipeline, not read back

A story's slug and branch are stamped onto the returned record from the pipeline's own
values. Status, commits and blockers are left as the agent reported them, because the
agent is the only party that watched the merge and those are its genuine observations.

The division is not "trust nothing." It is **whoever knows, says**. Asking an agent to
report a value the caller already holds invites a discrepancy that serves no one.

### 2. A correction is reported, never silent

When the agent's report differs from what the pipeline assigned, the disagreement is
logged naming both values. A silent correction would hide the drift that produced it,
and drift that nobody sees is drift that recurs. This is the same reasoning that governs
the dependency-escalation reconciliation in ADR-0008: the report is the deliverable.

### 3. Orphaned harness refs are reclaimed, but only when the commit survives the ref

A `worktree-*` ref is deleted only when its commit is reachable from a ref that is not
itself a `worktree-*` branch. That precondition is what makes the deletion lossless. A
harness ref carrying commits nothing else contains is **retained**, because it is the
only handle on them — the same retention principle ADR-0010 applies to the worktree of a
story that did not land.

## Consequences

**Positive.** The batch's record agrees with git about where each story's work lives. A
reporting stage can no longer file a record under the wrong story. Harness refs stop
accumulating, and the reason a mispositioned stage lands on the default branch is now
written down rather than rediscovered.

**Negative.** Two fields of the return schema are no longer the agent's to determine,
which is a small loss of expressiveness if a future stage has a legitimate reason to
rename a branch mid-flight. No such reason exists today.

**Risk accepted.** Stamping masks the case where an agent reported a *correct* branch
that the pipeline computed wrongly. The pipeline's value comes from `storyBranch`, a
single pure function guarded by a structural test, so the exposure is small — and the
disagreement log makes the mismatch visible either way.

## On what caught this

Neither defect was found by reasoning about the code. Both fell out of running the
pipeline and reading what came back against what git said. The branch drift was visible
in a returned record; the orphaned refs were visible in `git branch` during cleanup.

That is worth recording, because the four preceding defects in this suite shared a shape
— a value consumed that nothing supplies, or supplied that nothing consumes — and every
one of them was found the same way. Unit tests pass values in directly and cannot see it.

## References

- ADR-0009 (verify claims, do not attest them) — the principle this extends
- ADR-0010 (reclaim a sprint's worktrees by scoped selection) — the retention rule reused here
- `lib/workflows/_shared/stamp_story_facts.mjs`
- `lib/workflows/_shared/prune_story_worktrees.mjs`
