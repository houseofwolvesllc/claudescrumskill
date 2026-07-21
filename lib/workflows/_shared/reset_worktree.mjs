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
//   3. `git clean -fd -e node_modules -e '**/node_modules'`
//                                        — remove the untracked, NON-IGNORED files
//                                          a story left behind. Deliberately NO -x.
//                                          Without -x, git clean never touches a
//                                          gitignored path, so everything ignored
//                                          survives the reset untouched: node_modules
//                                          (the deps serial-in-tree exists to reuse),
//                                          the skill's own `.claude` install dir, the
//                                          orchestration's `.claude-scrum-skill`
//                                          state, and any `.env*` secrets. -x is
//                                          FORBIDDEN here — its blast radius is EVERY
//                                          ignored path, which silently and
//                                          unrecoverably destroys all of the above.
//                                          The node_modules excludes are NOT redundant
//                                          under -fd: they guard the rare repo that
//                                          leaves node_modules untracked AND
//                                          un-ignored, where a bare -fd would delete
//                                          it. (`**/node_modules` is itself redundant
//                                          with the no-slash `node_modules` exclude,
//                                          which already matches at any depth, but is
//                                          kept as harmless belt-and-suspenders.)

export function resetWorktreeCommands(releaseBranch) {
  return [
    ['reset', '--hard'],
    ['checkout', '-f', releaseBranch],
    ['clean', '-fd', '-e', 'node_modules', '-e', '**/node_modules'],
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
