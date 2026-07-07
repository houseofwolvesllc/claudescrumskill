// detect_repo_layout — pick the isolation strategy from whether node_modules is
// tracked. Canonical source of truth; the pure classifier is inlined into
// sprint_pipeline.js (the runtime cannot import), fed the stdout of
// `git ls-files node_modules` obtained via an agent (the runtime has no
// child_process — ADR-0006). detectIsolationStrategy is execGit-injected and
// exists only for the unit tests, which drive it against real git in temp dirs.
// Unit-tested by detect_repo_layout.test.mjs (E2).
//
// Axis: node_modules TRACKED vs UNTRACKED (NOT hoisted vs non-hoisted). A fresh
// `git worktree add` materializes tracked files only, so gitignored node_modules
// is absent regardless of workspace hoisting.

export const WORKTREE = 'worktree'
export const SERIAL_IN_TREE = 'serial-in-tree'

// Pure. Non-empty `git ls-files node_modules` stdout → tracked → worktree-safe;
// empty stdout (git exits 0 with no output when nothing matches — there is no
// exit-1 "no" case) → untracked → serial-in-tree; a command error (non-git dir,
// git exit 128, or any invocation failure) → serial-in-tree, the safe default.
export function classifyIsolationStrategy(lsFilesStdout, commandErrored) {
  if (commandErrored) return SERIAL_IN_TREE
  return String(lsFilesStdout ?? '').trim().length > 0 ? WORKTREE : SERIAL_IN_TREE
}

// execGit(args: string[]) => stdout string, throwing on command failure. The
// command-error case is caught here and mapped to the safe default, so a
// detector failure NEVER kills the batch (F9a).
export function detectIsolationStrategy(repoRoot, execGit) {
  try {
    const stdout = execGit(['-C', repoRoot, 'ls-files', 'node_modules'])
    return classifyIsolationStrategy(stdout, false)
  } catch {
    return classifyIsolationStrategy('', true)
  }
}
