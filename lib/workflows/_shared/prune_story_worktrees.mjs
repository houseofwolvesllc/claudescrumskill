// prune_story_worktrees — reclaim the git worktrees a worktree-mode sprint
// created. Canonical source of truth; the selection rule is inlined into
// sprint_pipeline.js and rendered into the teardown agent's prompt, because the
// runtime has no child_process (ADR-0006). Unit-tested by
// prune_story_worktrees.test.mjs.
//
// Worktree mode leaves two worktrees per story and nothing removes them: the
// Workflow tool reclaims a worktree only when it is unchanged, and a story's
// worktree always has commits. Sprints therefore accumulate worktrees and the
// disk they hold until someone notices.
//
// SELECTION IS THE WHOLE DESIGN. A blanket `git worktree remove` would take
// worktrees this sprint never created — other agents' workspaces, other
// concurrent sprints, and the user's own checkouts all coexist in one repo. A
// worktree is reclaimed only when BOTH hold:
//
//   1. It lives under `.claude/worktrees/`, the harness's own directory. The
//      main tree and every worktree outside that directory are never candidates.
//   2. It is identifiably this sprint's: either checked out on one of the story
//      branches this run was given, or detached at a commit already merged into
//      the release branch. The detached case is how the verify worktrees are
//      caught — they carry no branch to match on, and their commit becomes an
//      ancestor of the release branch precisely when their story has landed.
//
// Rule 2's second clause is what keeps a CONCURRENT sprint safe: its worktrees
// sit at commits not yet merged here, so they fail the ancestry test and are
// left alone.
//
// Removal takes the working directory, never a branch. `git worktree remove`
// deletes a checkout; the commits remain reachable from the story branch. The
// blast radius is therefore uncommitted changes only.
//
// A story that did NOT land keeps its worktree, so a failure stays inspectable.
// That is enforced by the CALLER, which passes only the branches of stories that
// reached a landed terminal state — `storyBranches` is the set to reclaim, not
// the set the sprint started with.

const HARNESS_WORKTREES_DIR = '.claude/worktrees/'

// `git worktree list --porcelain` emits blank-line-separated blocks of
// `key value` lines; `detached` is valueless. Unknown keys are ignored so a
// future git can add them without breaking the parse.
export function parseWorktreeList(porcelain) {
  return String(porcelain ?? '')
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(toWorktreeEntry)
}

function toWorktreeEntry(block) {
  const entry = { path: '', head: '', branch: '', detached: false }
  for (const line of block.split('\n')) {
    const [key, ...rest] = line.trim().split(' ')
    if (key === 'worktree') entry.path = rest.join(' ')
    if (key === 'HEAD') entry.head = rest.join(' ')
    if (key === 'branch') entry.branch = shortBranchName(rest.join(' '))
    if (key === 'detached') entry.detached = true
  }
  return entry
}

function shortBranchName(ref) {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
}

// isMergedIntoRelease(sha) => boolean — injected so the rule is testable without
// git. In the workflow the teardown agent answers it with
// `git merge-base --is-ancestor <sha> <releaseBranch>`.
export function selectRemovableWorktrees(entries, { storyBranches = [], isMergedIntoRelease }) {
  const owned = new Set(storyBranches)
  return entries
    .filter(isUnderHarnessWorktreesDir)
    .filter(entry => belongsToThisSprint(entry, owned, isMergedIntoRelease))
    .map(entry => entry.path)
}

function isUnderHarnessWorktreesDir(entry) {
  return entry.path.includes(HARNESS_WORKTREES_DIR)
}

function belongsToThisSprint(entry, ownedBranches, isMergedIntoRelease) {
  if (entry.branch) return ownedBranches.has(entry.branch)
  return Boolean(entry.head) && isMergedIntoRelease(entry.head)
}

export function pruneWorktreeCommands(paths) {
  const removals = paths.map(path => ['worktree', 'remove', '--force', path])
  return [...removals, ['worktree', 'prune']]
}
