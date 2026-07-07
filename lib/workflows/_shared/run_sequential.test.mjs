import { test } from 'node:test'
import assert from 'node:assert/strict'

import { runSequential } from './run_sequential.mjs'
import { topologicalOrder } from './topological_order.mjs'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('runs chains in the given order and returns results in that order', async () => {
  const order = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
  const seen = []
  const results = await runSequential(order, {
    runChain: async story => {
      seen.push(story.slug)
      return `done:${story.slug}`
    },
    resetBetween: async () => {},
  })
  assert.deepEqual(seen, ['a', 'b', 'c'])
  assert.deepEqual(results, ['done:a', 'done:b', 'done:c'])
})

test('never runs more than one chain in flight', async () => {
  const order = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }]
  let inFlight = 0
  let maxInFlight = 0
  await runSequential(order, {
    runChain: async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await tick()
      inFlight--
    },
    resetBetween: async () => {
      // A reset overlapping a chain would also violate single-in-flight.
      assert.equal(inFlight, 0)
    },
  })
  assert.equal(maxInFlight, 1)
})

test('runs resetBetween between every adjacent pair and never after the last', async () => {
  const order = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
  const resetPairs = []
  const completed = []
  await runSequential(order, {
    runChain: async story => {
      completed.push(story.slug)
    },
    resetBetween: async (prev, next) => {
      // Reset happens after the previous chain completed, before the next runs.
      assert.deepEqual(completed, order.slice(0, order.indexOf(prev) + 1).map(s => s.slug))
      resetPairs.push([prev.slug, next.slug])
    },
  })
  assert.deepEqual(resetPairs, [
    ['a', 'b'],
    ['b', 'c'],
  ])
})

test('does not require a resetBetween callback', async () => {
  const results = await runSequential([{ slug: 'only' }], {
    runChain: async story => story.slug,
  })
  assert.deepEqual(results, ['only'])
})

test('terminates (no deadlock) on an adverse-ordered dependency pair, running in topo order', async () => {
  // Array order is adverse: the dependent is listed before its blocker.
  const stories = [{ slug: 'dependent', blocked_by: ['blocker'] }, { slug: 'blocker' }]
  const executed = []
  const results = await runSequential(topologicalOrder(stories), {
    runChain: async story => {
      executed.push(story.slug)
      return story.slug
    },
    resetBetween: async () => {},
  })
  assert.deepEqual(executed, ['blocker', 'dependent'])
  assert.deepEqual(results, ['blocker', 'dependent'])
})
