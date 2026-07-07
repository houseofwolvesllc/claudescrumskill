// run_sequential — the serial-in-tree driver. Canonical source of truth; inlined
// into sprint_pipeline.js. Pure control flow over injected callbacks and
// unit-tested by run_sequential.test.mjs (E5).
//
// Runs exactly ONE story chain in flight: it awaits each story's full
// implement→review→verify→merge chain (runChain) before starting the next, and
// runs resetBetween BETWEEN adjacent stories only — after story N's chain
// settles and before story N+1's, never after the last. It consumes an order
// already sorted topologically (topological_order.mjs), so a dependent's blocker
// has always finished before the dependent starts; there is therefore NO lock —
// a lock ahead of the dependency-await would recreate the R2 deadlock. Zero
// concurrency dissolves both the shared-HEAD race (R1) and the lock (R2).

export async function runSequential(orderedStories, { runChain, resetBetween }) {
  const results = []
  for (let index = 0; index < orderedStories.length; index++) {
    if (index > 0 && resetBetween) {
      await resetBetween(orderedStories[index - 1], orderedStories[index])
    }
    results.push(await runChain(orderedStories[index], index))
  }
  return results
}
