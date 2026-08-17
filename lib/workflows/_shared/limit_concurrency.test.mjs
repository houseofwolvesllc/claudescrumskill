import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createConcurrencyLimiter } from './limit_concurrency.mjs'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function countingRun(counter) {
  return async () => {
    counter.inFlight++
    counter.peak = Math.max(counter.peak, counter.inFlight)
    await tick()
    counter.inFlight--
  }
}

test('never runs more tasks at once than the limit allows', async () => {
  const withSlot = createConcurrencyLimiter(2)
  const counter = { inFlight: 0, peak: 0 }

  await Promise.all([1, 2, 3, 4, 5, 6].map(() => withSlot(countingRun(counter))))

  assert.equal(counter.peak, 2)
})

test('runs every task and returns each result to its own caller', async () => {
  const withSlot = createConcurrencyLimiter(2)

  const results = await Promise.all(
    ['a', 'b', 'c'].map(name =>
      withSlot(async () => {
        await tick()
        return `done:${name}`
      }),
    ),
  )

  assert.deepEqual(results, ['done:a', 'done:b', 'done:c'])
})

test('releases the slot of a task that threw, so the queue keeps draining', async () => {
  const withSlot = createConcurrencyLimiter(1)
  const completed = []

  const failing = withSlot(async () => {
    throw new Error('chain blew up')
  })
  const following = withSlot(async () => {
    completed.push('following')
  })

  await assert.rejects(failing, /chain blew up/)
  await following
  assert.deepEqual(completed, ['following'])
})

test('lets a task that waits on a later task finish, because the wait is outside the slot', async () => {
  // The pipeline shape: a dependent awaits its blocker's outcome BEFORE taking a
  // slot, so a limit smaller than the chain depth cannot deadlock the batch.
  const withSlot = createConcurrencyLimiter(1)
  let releaseBlocker
  const blockerFinished = new Promise(resolve => {
    releaseBlocker = resolve
  })
  const executed = []

  const dependent = blockerFinished.then(() => withSlot(async () => executed.push('dependent')))
  const blocker = withSlot(async () => {
    executed.push('blocker')
    releaseBlocker()
  })

  await Promise.all([blocker, dependent])
  assert.deepEqual(executed, ['blocker', 'dependent'])
})

test('admits waiting tasks in the order they asked for a slot', async () => {
  const withSlot = createConcurrencyLimiter(1)
  const admitted = []

  await Promise.all(
    ['first', 'second', 'third'].map(name =>
      withSlot(async () => {
        admitted.push(name)
        await tick()
      }),
    ),
  )

  assert.deepEqual(admitted, ['first', 'second', 'third'])
})

test('refuses a limit that is not a positive whole number of slots', async () => {
  assert.throws(() => createConcurrencyLimiter(0), /positive/)
  assert.throws(() => createConcurrencyLimiter(-1), /positive/)
  assert.throws(() => createConcurrencyLimiter(1.5), /positive/)
  assert.throws(() => createConcurrencyLimiter(), /positive/)
})
