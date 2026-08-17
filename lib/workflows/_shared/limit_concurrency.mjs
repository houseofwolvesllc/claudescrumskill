// limit_concurrency — the fan-out bound, enforced. Canonical source of truth;
// inlined into sprint_pipeline.js. Pure control flow over injected callbacks and
// unit-tested by limit_concurrency.test.mjs.
//
// resolve_worktree_concurrency decides how many story chains may hold a worktree
// at once; this is what holds the batch to that number. Callers wrap the part of
// a chain that occupies a worktree in withSlot, and a chain that asks for a slot
// while all of them are taken waits, in the order it asked, until one is
// released.
//
// The slot is released in a finally, so a chain that threw frees the disk it was
// occupying — a limiter that leaked a slot per failure would converge on a batch
// that never runs another story.
//
// ORDERING IS LOAD-BEARING: a caller takes its slot AFTER awaiting whatever it
// depends on, never before. A dependent holding a slot while it waits for a
// blocker that has not started yet deadlocks the batch as soon as the limit is
// smaller than the chain depth — the same R2 deadlock the serial-in-tree driver
// avoids by putting the dependency-await ahead of its lock.

const SMALLEST_LIMIT = 1

export function createConcurrencyLimiter(limit) {
  if (!Number.isInteger(limit) || limit < SMALLEST_LIMIT) {
    throw new Error(
      `createConcurrencyLimiter: limit must be a positive whole number of slots, got ${limit}.`,
    )
  }

  const waiting = []
  let inFlight = 0

  async function withSlot(run) {
    await acquireSlot()
    try {
      return await run()
    } finally {
      releaseSlot()
    }
  }

  function acquireSlot() {
    if (inFlight < limit) {
      inFlight++
      return Promise.resolve()
    }
    return new Promise(resolve => waiting.push(resolve))
  }

  // The released slot passes straight to the longest-waiting caller rather than
  // being given up and re-taken, so a queued chain cannot be overtaken by one
  // that asks later.
  function releaseSlot() {
    const admitNext = waiting.shift()
    if (admitNext) {
      admitNext()
      return
    }
    inFlight--
  }

  return withSlot
}
