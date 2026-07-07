// reset_worktree — the dependency-preserving between-story reset for
// serial-in-tree execution. Canonical source of truth; resetWorktreeCommands is
// inlined into sprint_pipeline.js and rendered into the reset agent's prompt
// (the runtime has no child_process — ADR-0006). resetWorktree is
// execGit-injected for the unit tests, which drive it against real git in temp
// dirs. Unit-tested by reset_worktree.test.mjs (E4).
//
// Order matters and is EXACT:
//   1. `git reset --hard`               — discard conflicting uncommitted tracked
//                                          changes a failed/aborted Implement left,
//                                          so the checkout below cannot abort on a
//                                          dirty tree.
//   2. `git checkout -f <releaseBranch>`— return to the release branch.
//   3. `git clean -fdx -e node_modules -e '**/node_modules'`
//                                        — remove stray build artifacts (dist/,
//                                          coverage) while PRESERVING every
//                                          node_modules (root + nested). A bare
//                                          `git clean -fdx` is FORBIDDEN — its -x
//                                          would delete the untracked node_modules
//                                          serial-in-tree exists to reuse. The
//                                          '**/node_modules' exclude is redundant
//                                          (a no-slash exclude already matches at
//                                          any depth) but kept as harmless
//                                          belt-and-suspenders.

export function resetWorktreeCommands(releaseBranch) {
  return [
    ['reset', '--hard'],
    ['checkout', '-f', releaseBranch],
    ['clean', '-fdx', '-e', 'node_modules', '-e', '**/node_modules'],
  ]
}

// execGit(args: string[]) => stdout; throws on failure. Runs the commands in
// order against repoRoot. Used by the unit tests; in the workflow the same
// command list is handed to an agent (no in-runtime child_process).
export function resetWorktree(repoRoot, releaseBranch, execGit) {
  for (const args of resetWorktreeCommands(releaseBranch)) {
    execGit(['-C', repoRoot, ...args])
  }
}
