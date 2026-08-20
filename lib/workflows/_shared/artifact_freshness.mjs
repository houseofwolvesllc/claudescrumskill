// artifact_freshness — whether a phase's artifact was written by the run that
// claims to have written it. Canonical source of truth; inlined into
// sprint_pipeline.js (the runtime cannot import), kept in sync by
// inline_sync.test.mjs. Pure and unit-tested by artifact_freshness.test.mjs.
//
// A phase that leaves a file behind is a phase whose completion is checkable.
// In one production run an orchestrator wrote an emulation pass and a cleanup
// pass into its state file as complete while neither report directory had been
// touched in weeks — two claims, both disprovable by one stat, and nothing ran
// it. So the claim is read against the artifact instead of taken on the
// orchestrator's account of itself: the report postdates the phase's start, or
// this phase did not write it.
//
// The runtime has no filesystem access (ADR-0006), so the mtime arrives as data
// from an agent-delegated probe exactly as the repo-layout facts do. Owning the
// comparison and nothing else is what keeps it answerable without a filesystem,
// and the stat replaceable without touching the rule.
//
// Both timestamps are ISO-8601, the one form each side states without units. An
// epoch number is seconds to one probe and milliseconds to the next, and a gate
// that silently reads the wrong unit is worse than no gate at all.
//
// Anything unmeasured is not fresh. A missing artifact has no mtime, a probe
// that could not stat one answers with none, and a phase start nobody captured
// is nothing to compare against — each leaves the comparison unmade, and an
// unmade comparison is not evidence that the phase ran. For an autonomous run
// that is the safe direction: a phase re-run needlessly costs time, and a phase
// wrongly marked complete is the thing this exists to catch.

// Whether the artifact was written after the phase began. An mtime equal to the
// phase start is fresh — filesystems report mtime at second granularity, so a
// report written inside the phase's first second lands on the start itself, and
// only an mtime that predates it is evidence of an earlier run.
export function artifactIsFresh({ phaseStartedAt, artifactModifiedAt }) {
  const started = Date.parse(phaseStartedAt)
  const modified = Date.parse(artifactModifiedAt)
  if (Number.isNaN(started) || Number.isNaN(modified)) return false
  return modified >= started
}
