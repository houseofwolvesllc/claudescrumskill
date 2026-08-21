// retry_placement — how many times a reading stage is given a tree before its
// misplacement is called a failure, and what is said each time. Canonical source
// of truth; inlined into sprint_pipeline.js. Unit-tested by
// retry_placement.test.mjs.
//
// A stage that read the wrong tree discovered where the harness put it, not
// whether the code works (ADR-0009). Until now that ended the story: the harness
// caught its own placement error and then reported it as the story's outcome,
// which is a caught problem turned into a lost story for no reason.
//
// Retrying is sound here because of two properties that do NOT hold generally:
//
//   1. Verification only READS. Re-running it commits nothing, opens nothing,
//      and merges nothing, so a second attempt cannot double anything up.
//   2. In worktree mode each attempt is given a FRESH worktree, so a retry is a
//      genuinely different placement rather than the same one repeated. The
//      harness parks every new worktree at the repository's default branch and
//      the stage repositions itself; an attempt that failed to reposition tells
//      us nothing about whether the next one will.
//
// Neither property holds at IMPLEMENT, which commits — retrying it would risk a
// second set of commits for one story — so a dependency-setup failure is NOT
// retried here. That is a deliberate boundary, not an omission.
//
// The limit is two attempts rather than more because the failure is bimodal: a
// stage either repositions itself or does not, and a third attempt buys little
// against a systematic cause while costing a full stage every time.

export const PLACEMENT_ATTEMPT_LIMIT = 2

export function placementAttemptsRemain(attempt, limit = PLACEMENT_ATTEMPT_LIMIT) {
  return attempt < limit
}

// Said when an attempt is being given up on and another is coming. It names what
// HEAD actually printed, so a systematic misplacement is readable across retries
// rather than looking like one flaky run.
export function placementRetryNotice({ storySlug, attempt, observed, limit = PLACEMENT_ATTEMPT_LIMIT }) {
  return (
    `Story ${storySlug}: verification attempt ${attempt} of ${limit} read the wrong tree ` +
    `(HEAD printed ${observed || 'nothing'}) — this is a placement failure, not a finding about ` +
    `the story. Retrying in a fresh tree.`
  )
}

// Appended to the failure reason once the attempts are spent, so the record says
// the misplacement survived a retry. A reader who sees this knows the cause is
// systematic rather than a single unlucky placement.
export function exhaustedPlacementDetail({ observed, attempts = PLACEMENT_ATTEMPT_LIMIT }) {
  return `${observed || 'nothing'} (unchanged across ${attempts} attempts)`
}
