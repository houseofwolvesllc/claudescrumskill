// assert_tree_identity — the precondition the verify stage clears before it
// describes anything it read: that the tree under it is the one it was placed
// at. Canonical source of truth; inlined into sprint_pipeline.js (the runtime
// cannot import), kept in sync by inline_sync.test.mjs. Pure and unit-tested by
// assert_tree_identity.test.mjs.
//
// A stage standing in a tree whose content lives elsewhere reads a directory
// that is empty because it is the wrong directory, and reports that as a finding
// about the story: 'src/ is completely empty'. That sentence and 'I cannot read
// the tree I was pointed at' are different diagnoses, and only the second is
// true — one production run spent days hunting a story that had failed to write
// files, twelve occurrences over, on the strength of the first.
//
// So identity is settled first, and against the one value the stage cannot infer
// from what it is standing in: the commit the implement stage reported. The
// runtime has no child_process (ADR-0006), so the comparison is delegated to the
// agent in that tree exactly as the between-story reset delegates its git
// commands.
//
// An implement result carrying no commit offers nothing to measure the tree
// against, so the stage keeps the behaviour it had before there was a commit to
// measure it against — a precondition that cannot be evaluated is not one that
// failed.
//
// The stage's own failure report says the tree was wrong only when the stage
// noticed it was wrong, and a stage that reports on the wrong tree is precisely
// one that did not notice. So the SHA it stood at comes back on every path and
// the comparison is made again here, in data, where it holds whether or not the
// stage drew the conclusion itself.

const NOTHING_TO_ASSERT_AGAINST = ''
const NO_MISMATCH = ''

export function treeIdentityAssertion(headCommit) {
  if (!headCommit) return NOTHING_TO_ASSERT_AGAINST
  return (
    `Before you read or report on any file, run \`git rev-parse HEAD\` and return what it ` +
    `printed as \`observedHead\` — on every path, whether or not it is the expected commit. ` +
    `This tree is this story's only if HEAD printed ${headCommit}. If it printed anything else, ` +
    `this tree is not the one this story's code was committed to: return verifyStatus fail with ` +
    `\`treeIdentityFailure\` set to what HEAD printed, and stop there, saying nothing about ` +
    `file content. An empty or missing directory in a tree you were never placed in is a fact ` +
    `about placement, not a finding about this story.`
  )
}

// The SHA the stage stood at when it is not the commit the stage was placed at —
// empty when the tree was the story's, and empty when there is nothing to
// compare: no assigned commit, or a stage that carried back no HEAD.
export function mismatchedHead({ assigned, observed }) {
  if (!assigned || !observed) return NO_MISMATCH
  return observed === assigned ? NO_MISMATCH : observed
}
