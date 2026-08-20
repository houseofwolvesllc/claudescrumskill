// stamp_story_facts — hold a story's returned record to the facts the pipeline
// assigned rather than the ones the reporting agent chose. Canonical source of
// truth; inlined into sprint_pipeline.js. Unit-tested by
// stamp_story_facts.test.mjs.
//
// The PR stage returns the WHOLE story record, so a story's slug and branch in
// the batch's output were whatever that agent said they were — even though the
// pipeline assigned both before the agent ran. Observed: a story implemented on
// its own epic-namespaced branch came back naming the release branch instead —
// the merge target — so the batch's own record disagreed with git about where
// the work lived.
//
// Slug and branch are the pipeline's to state; correct them. Everything else in
// the record — status, commits, blockers — is the agent's genuine observation
// and is left untouched, because the agent is the only one who watched the merge.
//
// The disagreement is REPORTED, not silently overwritten. A silent correction
// would hide the drift that produced it, and the same reasoning already governs
// the dependency-escalation reconciliation: the report is the deliverable.

export function stampStoryFacts(reported, { storySlug, branch }) {
  return { ...reported, storySlug, branch }
}

// An empty array means the record already agreed with the pipeline. Each entry
// names the field, what the agent said, and what the pipeline assigned.
export function storyFactDisagreements(reported, { storySlug, branch }) {
  return [
    disagreement('storySlug', reported?.storySlug, storySlug),
    disagreement('branch', reported?.branch, branch),
  ].filter(Boolean)
}

// A field the agent simply omitted is not a disagreement — it reported nothing
// to disagree with, and stamping fills it in.
function disagreement(field, reportedValue, assignedValue) {
  if (!reportedValue || reportedValue === assignedValue) return null
  return `${field}: agent reported '${reportedValue}', pipeline assigned '${assignedValue}'`
}
