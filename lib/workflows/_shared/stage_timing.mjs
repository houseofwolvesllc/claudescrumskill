// stage_timing — wraps an agent-calling function so every call it makes leaves
// behind one timed interval. Canonical source of truth; a later story inlines
// this block into the workflow script that captures telemetry (the runtime
// cannot import), after which inline_sync.test.mjs holds the copy in step. Pure
// but for the clock, and unit-tested by stage_timing.test.mjs.
//
// A run that cannot say where its wall-clock time went cannot be tuned. The
// pipeline calls one agent function for every stage, so wrapping that function
// once records each stage without threading a timer through every call site:
// the wrapper stamps the start, awaits the real work, stamps the end, and keeps
// the interval. agentFn is injected rather than closed over the runtime's
// `agent` global so the wrapper is testable under node --test, where that global
// is absent (ADR-0006).
//
// Timestamps are ISO-8601 wall-clock from Date, the same absolute form
// artifact_freshness reads, so intervals captured by concurrently running
// stories compose onto one timeline. performance.now() would be monotonic but
// per-process and unanchored, which is exactly what a cross-story timeline
// cannot use.
//
// endedAt is stamped in a finally, so the success, null-return, and throw paths
// each record exactly one interval; the throw path re-throws the original error
// untouched, because timing a stage must not swallow its failure.

export function createStageTimer(agentFn) {
  const timings = []

  async function timedAgent(prompt, opts) {
    const startedAt = new Date().toISOString()
    let endedAt
    try {
      return await agentFn(prompt, opts)
    } finally {
      endedAt = new Date().toISOString()
      timings.push({ label: opts.label, phase: opts.phase, startedAt, endedAt })
    }
  }

  return { timedAgent, timings }
}
