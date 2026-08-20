// classify_story_failure — the two classes a story's failure falls into, and the
// status each is reported under. Canonical source of truth; inlined into
// sprint_pipeline.js (the runtime cannot import), kept in sync by
// inline_sync.test.mjs. Pure and unit-tested by classify_story_failure.test.mjs.
//
// 'failed' says one thing: the story's code did not work. A worktree that never
// obtained node_modules never ran the story's code at all, and reporting that
// under the same status sends the next reader hunting a defect that does not
// exist — an hour spent on a phantom bug, and the real fix (a filesystem, a
// lockfile, a registry) untouched. So the tree's failure is its own outcome,
// 'infrastructure-failed', and the story's own failure is left exactly as it was.
//
// A tree that is not the one the stage was placed at is the same category
// arriving from the other direction: the harness put the stage somewhere, and
// the somewhere was wrong. It reports under the same status for the same reason
// — there is no defect here to hunt — because a second vocabulary for one
// category is how the category stops being read at all.
//
// The infrastructure reason names the strategy that failed, because the fix
// differs by strategy — a clone that failed points at the filesystem, an install
// at the lockfile or the network, a symlink at the main tree — and it ends with
// the worktree's own words, so the operator reads what the command actually said
// rather than a paraphrase of it.

export const FAILED = 'failed'
export const INFRASTRUCTURE_FAILED = 'infrastructure-failed'

// A worktree that reported no detail is still a worktree that failed, and the
// strategy alone is enough to act on; a reason ending in a bare colon is not.
const NO_DETAIL_REPORTED = 'the worktree reported no detail'

// A tree identified by nothing is still a tree that was not the story's, and the
// revision it should have been at is enough to act on; a reason ending in a bare
// colon is not.
const NO_HEAD_REPORTED = 'the stage did not report what HEAD printed'

// The story ran and its code did not work — the one thing 'failed' has ever
// meant here, unchanged.
export function codeFailure(detail) {
  return { status: FAILED, reason: `Unhandled error: ${detail}` }
}

// The worktree could not obtain its dependencies, so nothing in it ever ran the
// story's code.
export function dependencySetupFailure({ strategy, detail = '' }) {
  return {
    status: INFRASTRUCTURE_FAILED,
    reason:
      `Dependency setup failed under the '${strategy}' strategy, so the story's code was never ` +
      `exercised — this is an infrastructure failure of the worktree, not a defect in the story. ` +
      `The worktree reported: ${detail || NO_DETAIL_REPORTED}`,
  }
}

// The stage read a tree that is not the story's, so no file it opened belongs to
// the story and nothing it says about content is about this code. Reporting that
// as a finding is what turns a placement error into a hunt for a defect that was
// never there — twelve occurrences of it in one production run — so it is the
// tree's failure, named by the revision the tree was supposed to be at and by
// what HEAD printed instead.
export function treeIdentityFailure({ revision, detail = '' }) {
  return {
    status: INFRASTRUCTURE_FAILED,
    reason:
      `The tree was not at ${revision}, so nothing it read belongs to this story — this is an ` +
      `infrastructure failure of the tree's placement, not a defect in the story. ` +
      `HEAD printed: ${detail || NO_HEAD_REPORTED}`,
  }
}
