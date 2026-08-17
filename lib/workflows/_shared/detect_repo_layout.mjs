// detect_repo_layout — pick the isolation strategy from whether a fresh
// worktree can obtain its dependencies. Canonical source of truth; the pure
// classifier is inlined into sprint_pipeline.js (the runtime cannot import),
// fed the stdout of `git ls-files node_modules` obtained via an agent (the
// runtime has no child_process — ADR-0006). detectIsolationStrategy is
// execGit-injected and exists only for the unit tests, which drive it against
// real git in temp dirs. Unit-tested by detect_repo_layout.test.mjs (E2).
//
// The gate asks whether this worktree can GET dependencies, not whether they
// are already tracked. A fresh `git worktree add` materializes tracked files
// only, so a tracked node_modules rides in with the worktree — but an untracked
// one is obtainable too, by any provisioning strategy whose preconditions hold
// here (resolve_dependency_strategy owns which those are, and hands the list
// in). Only a repo where nothing can fill an empty worktree is reduced to
// running its stories one at a time, which is why almost every repo used to be:
// almost nobody vendors node_modules.

export const WORKTREE = 'worktree'
export const SERIAL_IN_TREE = 'serial-in-tree'

// Pure. `git ls-files node_modules` prints the tracked paths and exits 0 with
// no output when there are none — there is no exit-1 "no" case, so the stdout
// is the whole answer.
export function dependenciesAreTracked(lsFilesStdout) {
  return String(lsFilesStdout ?? '').trim().length > 0
}

// Pure. Tracked dependencies arrive with a fresh worktree and an untracked
// node_modules is provisioned into one by any viable strategy, so either
// answers the gate. No viable strategy over untracked dependencies leaves every
// fresh worktree dependency-empty → serial-in-tree, and so does a command error
// (non-git dir, git exit 128, or any invocation failure): a repository git
// cannot read is one nobody can add a worktree to.
export function classifyIsolationStrategy(lsFilesStdout, commandErrored, viableProvisioning = []) {
  if (commandErrored) return SERIAL_IN_TREE
  if (dependenciesAreTracked(lsFilesStdout)) return WORKTREE
  return viableProvisioning.length > 0 ? WORKTREE : SERIAL_IN_TREE
}

// execGit(args: string[]) => stdout string, throwing on command failure. The
// command-error case is caught here and mapped to the safe default, so a
// detector failure NEVER kills the batch (F9a).
export function detectIsolationStrategy(repoRoot, execGit, viableProvisioning = []) {
  try {
    const stdout = execGit(['-C', repoRoot, 'ls-files', 'node_modules'])
    return classifyIsolationStrategy(stdout, false, viableProvisioning)
  } catch {
    return classifyIsolationStrategy('', true, viableProvisioning)
  }
}
