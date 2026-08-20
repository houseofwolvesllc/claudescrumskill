# ADR-0009: Verify Claims, Do Not Attest Them

- **Status:** Accepted
- **Date:** 2026-08-20
- **Deciders:** Keith Garcia (project owner)

## Context

A 46-story production run of `/project-orchestrate` delivered 45 of 46 stories and
produced a debrief whose closing observation is the reason this ADR exists:

> Nine of twelve findings share one shape: **the harness had the information needed
> to catch the problem and did not check.** The skill is good at deciding *what work
> to do next*. It currently does almost nothing to verify that what it just claimed
> happened, happened.

Three of those findings were cheap enough to close immediately, and they cost the
most: an agent reading the wrong tree (~12 occurrences, ≥4 false BLOCKED reports,
~14 cascaded blocks), an epic reported underway with half its stories never
dispatched, and an emulation phase written into the state file as complete when its
report had not been touched in weeks.

## Decision

### 1. Point verification at a commit, not a branch

A branch ref is held by exactly one worktree; a commit is held by none. Verification
was instructed to `git checkout <branch>`, which fails when the implement stage holds
that branch — leaving the agent reading a tree that does not contain the work.

Verification now detaches at an explicit SHA. This is a one-flag change that closes
the run's single largest source of lost work, and it was found by a subagent working
one story rather than by the orchestrator, which had declared the problem
unresolvable.

### 2. Identity is asserted before content is reported

*"`src/` is completely empty"* and *"I cannot read the tree I was pointed at"* are
different diagnoses. Rendering them as the same sentence is what turned one incident
into twelve, because the first sends the reader hunting a story that failed to write
files.

The distinction is now structural rather than a matter of phrasing: the agent
confirms `git rev-parse HEAD` matches its assigned SHA **before** reporting on any
file, the observed SHA rides in the structured return, and a mismatch is
`infrastructure-failed` — the vocabulary added in 2.4.0 for exactly this category.
A harness placement error is not a code failure.

### 3. A claim about a set is checked against the set

The pipeline returned one entry per story and nothing compared the returned set
against the requested set, so a truncated batch was indistinguishable from a
completed one. The comparison is by story ID rather than by success, so a blocked or
failed story still counts as reported — the question is whether anything came back,
not whether it went well.

### 4. Phases are marked complete by their artifact

A phase that writes a report is complete when the report was written by this run,
not when the orchestrator says so. The gate reads the report's mtime and compares it
against the phase start; stale, missing, and unreadable all fail closed.

**The gate lives in the skill, not the workflow, and that is not a compromise.** The
Workflow runtime cannot read a filesystem (ADR-0006), so the only place that can
`stat` a report is the orchestrator — which is an agent capable of running the
command and comparing the result. Putting the comparison where the data is beats
putting it where the code is.

## Consequences

**Positive.** The run's three most expensive findings are closed by one flag, one set
comparison, and one timestamp. Tests went 233 → 280.

**Negative.** The freshness gate is now specified in two places — the SKILL.md
instruction that executes it, and a `_shared/` module that unit-tests its semantics.
They can drift. The module's `modified >= started` and the skill's "at or after" are
currently identical and nothing enforces that they stay so.

**What emulation caught.** The freshness module shipped inlined into the pipeline and
called from nowhere: 41 lines of dead code with zero call sites, registered in the
inline manifest. The inline is removed; the module and its tests remain as the
executable specification. This is worth recording because it is the same shape as the
release it belongs to — something that looked like a check but was not reachable.

**Unproven.** None of these paths has executed in a real multi-worktree run. The
tree-identity fix is verified by unit test and by structural assertion on the prompt;
it has not yet been exercised by two agents actually contending for one branch.

## On a recurring defect in this codebase

Three consecutive releases shipped a value that nothing supplied — `sessionModel`
(2.3.0), `viableProvisioning` (2.4.0), `copyOnWriteSupported` (2.5.0) — each reading
`undefined` in production while unit tests passed, because unit tests pass the value
directly and `const { x } = probe` looks identical whether or not anything sets `x`.
`test/probe_schema_coverage.test.js` now catches that direction statically.

This release found the inverse: a value fully supplied and never read. The general
lesson is the debrief's, one level down — **information in hand is not the same as
information checked.**

## Future work

The remaining nine debrief findings, in the order their own author prioritized them:
a resource ceiling bounding RAM as well as disk with guaranteed worktree teardown
(the run OOM'd and left 25 orphaned worktrees consuming 65GB); recursive symlinking
of nested `node_modules`; `EnterWorktree` denied to subagents or `ExitWorktree`
shipped alongside it; findings requiring a quotable anchor checked mechanically; a
module-ownership registry in the sprint plan; a syntax gate on conflict-resolved
files; an AC self-consistency pass at spec time; and citation of orchestrator claims
about repository state.

## References

- Spec: `docs/specs/20260820_103127_orchestrator_claim_verification.md`
- Builds on ADR-0008 (worktree dependency provisioning) and ADR-0006 (workflow execution robustness)
