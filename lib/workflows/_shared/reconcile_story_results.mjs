// reconcile_story_results — the batch's own bookkeeping: the story IDs it was
// asked to run, read back against the IDs its results carry. Canonical source of
// truth; inlined into sprint_pipeline.js (the runtime cannot import), kept in
// sync by inline_sync.test.mjs. Pure and unit-tested by
// reconcile_story_results.test.mjs.
//
// A batch that drops a story returns a shorter array and nothing else — the same
// shape, the same field names, the same statuses a completed batch returns — so
// the only reader who can tell the two apart is one who counted first. In a
// production run an orchestrator dispatched seven of fourteen stories and
// reported the epic underway; the user noticed, and no tooling did. The
// information to catch it was in hand the whole time: two sets and a difference.
//
// So the comparison is made on every batch, and the batch says which one it was.
// A complete batch reports the count it reconciled rather than staying silent,
// because silence is exactly what a dropped reconciliation looks like, and the
// line an operator never sees is the line they cannot act on.
//
// The comparison is by ID. A story that came back blocked, failed, or
// infrastructure-failed was run and reported on, which is the question here —
// whether the batch accounted for the story, not whether the story succeeded.

// The report line the batch is logged by: how many stories were reconciled when
// every requested one came back, and which are unaccounted for when they did
// not.
export function reconcileStoryResults({ requested = [], returned = [] }) {
  const unaccountedFor = storiesNothingCameBackFor(requested, returned)
  if (unaccountedFor.length === 0) {
    return `Batch reconciliation: all ${requested.length} requested stories returned a result.`
  }
  return (
    `INCOMPLETE BATCH: ${unaccountedFor.length} of ${requested.length} requested stories returned no ` +
    `result at all — ${unaccountedFor.join(', ')}. A batch that returns fewer results than it was ` +
    `asked for has not completed: nothing came back for these stories, so their outcome is unknown ` +
    `rather than done, and whatever reads this batch as finished is reading a truncated one.`
  )
}

// The requested IDs no result carries, in the order they were asked for — empty
// when every one of them came back, whatever it came back as.
function storiesNothingCameBackFor(requested, returned) {
  const reported = new Set(returned.map(result => result.storySlug))
  return requested.map(story => story.slug).filter(slug => !reported.has(slug))
}
