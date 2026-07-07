// topological_order — order stories so every in-batch blocker precedes its
// dependents (Kahn's algorithm over in-batch blockers). Canonical source of
// truth; inlined into sprint_pipeline.js for serial-in-tree execution. Pure and
// unit-tested by topological_order.test.mjs (E3).
//
// This is NET-NEW logic and is required: a naive array-order serialization
// re-deadlocks when a dependent precedes its blocker in the array (the
// dependent would await a blocker the serial loop has not started). The DAG is
// validated upstream, so a cycle is can't-happen — but house style is fail-loud,
// so a cycle THROWS rather than silently misorders.

// In-batch blockers of a story, by trailing slug. blocked_by entries may be bare
// slugs or "<epic>/<slug>" references; a story cannot block itself; blockers
// outside the batch are the orchestrator's concern. (Named distinctly from the
// script's own inBatchBlockers so the two coexist when inlined together.)
function inBatchBlockersOf(story, batchSlugs) {
  return (story.blocked_by || [])
    .map(reference => reference.split('/').pop())
    .filter(slug => slug !== story.slug && batchSlugs.has(slug))
}

export function topologicalOrder(stories) {
  const batchSlugs = new Set(stories.map(story => story.slug))
  const blockersBySlug = new Map(
    stories.map(story => [story.slug, inBatchBlockersOf(story, batchSlugs)]),
  )

  const emitted = new Set()
  const order = []
  while (order.length < stories.length) {
    // Stable: among ready stories, take the earliest in the original array.
    const next = stories.find(
      story =>
        !emitted.has(story.slug) &&
        blockersBySlug.get(story.slug).every(blocker => emitted.has(blocker)),
    )
    if (!next) {
      const remaining = stories.filter(story => !emitted.has(story.slug)).map(story => story.slug)
      throw new Error(
        `topologicalOrder: dependency cycle among in-batch stories [${remaining.join(', ')}].`,
      )
    }
    emitted.add(next.slug)
    order.push(next)
  }
  return order
}
