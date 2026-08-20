# ADR-0010: Reclaim a Sprint's Worktrees by Scoped Selection, Never by Pruning

- **Status:** Accepted
- **Date:** 2026-08-20
- **Deciders:** Keith Garcia (project owner)

## Context

Worktree mode (ADR-0008) leaves two worktrees per story — one holding the story branch,
one detached at the commit verification checked out — and nothing removed them. The
Workflow tool reclaims a worktree only when it is unchanged, and a story's worktree
always carries commits, so every worktree-mode sprint ended with 2N of them on disk.

This is the first item of ADR-0009's future work, and it is there because a real run
paid for it: the 46-story production run OOM'd and left **25 orphaned worktrees holding
65GB**. Nothing in the pipeline had ever been responsible for giving them back.

Teardown is easy to write and easy to write dangerously. The command that removes every
stale worktree in one line — `git worktree prune`, or a loop over the full listing — is
also the command that deletes another agent's live workspace, because a repository is
not one sprint's private property.

## Decision

### 1. Selection is the whole design

A worktree is reclaimed only when **both** conditions hold:

1. **It lives under `.claude/worktrees/`** — the harness's own directory. The main tree
   and every checkout outside that directory are never candidates, whatever state they
   are in.
2. **It is identifiably this sprint's** — either checked out on one of the story branches
   this run was given, or detached at a commit already merged into the release branch.
   The detached case is how verification's worktrees are caught: they carry no branch to
   match on, and their commit becomes an ancestor of the release branch precisely when
   their story has landed.

The second condition is what keeps a *concurrent* sprint safe. Its worktrees sit at
commits not yet merged here, so they fail the ancestry test and are left alone. A
blanket prune has no way to draw that line, which is why teardown does not use one.

Only stories that reached a landed terminal state contribute branches. A story that
failed keeps its worktree, so the failure stays inspectable.

### 2. The rule runs in the pipeline, over git's real listing

Teardown is driven by two agents, and neither of them decides anything. A probe agent
runs `git worktree list --porcelain` and, for every detached block, reports whether
`git merge-base --is-ancestor` puts that HEAD on the release branch. The pipeline parses
that output and applies the rule. A remover agent is then handed exact paths and no
discretion — do not add paths, do not remove a worktree that is not listed.

This is ADR-0009 applied to teardown: **a claim about repository state is checked against
the state, not taken from an agent's description of it.** An agent asked to "remove this
sprint's worktrees" would have to infer which ones those are, and an inference that is
wrong deletes someone's uncommitted work. Agents observe and execute; the rule is code,
and the code is unit-tested against listings that git could actually emit.

### 3. Removal takes the checkout, never the branch

`git worktree remove` deletes a working directory; the commits stay reachable from the
story branch. The blast radius of a wrong selection is therefore uncommitted changes
only — bad, but recoverable, and bounded by condition 1.

## Consequences

**Positive.** A worktree-mode sprint now returns the disk it borrowed, at the one moment
the ancestry test is meaningful: after every merge has landed. The pipeline reports what
it reclaimed by path, so teardown is auditable rather than silent.

**Negative.** Two more agent calls per sprint on the cheapest tier, and a probe that
fails leaves every worktree in place. Failing to reclaim is the correct direction to
fail, but it means the leak returns quietly whenever the probe cannot run.

**Bounded by design.** Worktrees this sprint did not create are never reclaimed, so an
orphan from a *crashed* run — exactly the 25 the debrief counted — outlives the sprint
that made it. Teardown fixes the accumulation, not the backlog.

## References

- Implementation: `lib/workflows/_shared/prune_story_worktrees.mjs`, inlined into
  `lib/workflows/sprint_pipeline.js` per ADR-0006
- Builds on ADR-0009 (verify claims, do not attest them) and ADR-0008 (worktree
  dependency provisioning)
