# CONTEXT — serial-in-tree-execution

> Design anchor from the design-spike epic. See ADR-0006 and the spec. Read the
> args-normalization CONTEXT.md first for the runtime reality and inlining pattern.

## Runtime reality

No `child_process`: git runs via `agent(...)`. Extract **pure** logic (inlined),
delegate git execution to agents.

## Modules & tests (all owned here)

- `lib/workflows/_shared/topological_order.mjs` + test (E3) — pure Kahn's
  algorithm over in-batch blockers; **throws on a cycle** (fail-loud house
  style, though upstream-validated DAG makes it can't-happen). NOT array order.
- `lib/workflows/_shared/reset_worktree.mjs` + test (E4) — exports
  `resetWorktreeCommands(releaseBranch)` (pure, ordered command list) and
  `resetWorktree(repoRoot, releaseBranch, execGit)` (execGit-injected, tests
  only). Order is **exactly**: `git reset --hard` → `git checkout -f <rb>` →
  `git clean -fd -e node_modules -e '**/node_modules'`. The `-x` flag is
  deliberately omitted: without it, git clean spares **every** gitignored path,
  so `node_modules`, the `.claude` install dir, `.claude-scrum-skill` state, and
  `.env*` secrets all survive (`-x` would delete every ignored path). E4 dirties
  a TRACKED file whose content differs between the story branch and
  `releaseBranch` (a plain checkout would genuinely conflict) then asserts clean
  tree + every gitignored path (`node_modules` root + nested, `dist/`, `.claude`,
  `.claude-scrum-skill`, `.env*`) survives + untracked non-ignored cruft cleared.
- `lib/workflows/_shared/run_sequential.mjs` + test (E5) — exports
  `runSequential(orderedStories, { runChain, resetBetween })`: runs exactly ONE
  chain in flight; awaits each story's full chain before the next; runs
  `resetBetween` between adjacent pairs only (after N's merge captured, before
  N+1's checkout, NOT after the last). **No lock** before the dependency-await.
  E5 asserts order == topo order, single-in-flight, between-pair reset,
  termination on an adverse-ordered pair.

## sprint_pipeline.js two-model restructure (F7, F7a–d, F7c)

Strategy resolved once (F5) → applies to the whole batch; the two models
(parallel-worktree, sequential-in-tree) are NEVER mixed within a run.

- **worktree mode:** behaviorally unchanged (existing parallel chains,
  `isolation: 'worktree'` on Implement/Verify, serialized merge).
- **serial-in-tree mode:** `topologicalOrder(stories)` → `runSequential` with
  `runChain` = the impl→review→verify→merge chain (Implement/Verify **omit**
  `isolation: 'worktree'`), `resetBetween` = an `agent(...)` running
  `resetWorktreeCommands(releaseBranch)`. `runChain` records each story's
  terminal outcome into the existing `terminal` map before advancing, so a
  dependent's `terminal.get(blocker)` await is already resolved in topo order.

## Prompt reconciliation (179/200)

Implement/Verify prompts assert "You are in an isolated git worktree" — make the
branch-safety language **conditional** on the isolation mode so an in-tree agent
is told its real execution mode (in serial-in-tree it works on the shared tree
and must not assume worktree isolation).
