import { test } from 'node:test'
import assert from 'node:assert/strict'

import { topologicalOrder } from './topological_order.mjs'

const slugs = ordered => ordered.map(story => story.slug)

test('orders a linear chain so each blocker precedes its dependent', () => {
  const stories = [
    { slug: 'a' },
    { slug: 'b', blocked_by: ['a'] },
    { slug: 'c', blocked_by: ['b'] },
  ]
  assert.deepEqual(slugs(topologicalOrder(stories)), ['a', 'b', 'c'])
})

test('reorders an adverse array (dependent listed before its blocker)', () => {
  // This is the case that would re-deadlock a naive array-order serialization
  // at sprint_pipeline.js:289.
  const stories = [
    { slug: 'dependent', blocked_by: ['blocker'] },
    { slug: 'blocker' },
  ]
  assert.deepEqual(slugs(topologicalOrder(stories)), ['blocker', 'dependent'])
})

test('reorders a fully-reversed chain into dependency order', () => {
  const stories = [
    { slug: 'c', blocked_by: ['b'] },
    { slug: 'b', blocked_by: ['a'] },
    { slug: 'a' },
  ]
  assert.deepEqual(slugs(topologicalOrder(stories)), ['a', 'b', 'c'])
})

test('is stable: independent stories keep their original array order', () => {
  const stories = [{ slug: 'x' }, { slug: 'y' }, { slug: 'z' }]
  assert.deepEqual(slugs(topologicalOrder(stories)), ['x', 'y', 'z'])
})

test('resolves "<epic>/<slug>" blocked_by references by trailing slug', () => {
  const stories = [
    { slug: 'ui', blocked_by: ['core-api/auth'] },
    { slug: 'auth' },
  ]
  assert.deepEqual(slugs(topologicalOrder(stories)), ['auth', 'ui'])
})

test('ignores blockers outside the batch and self-references', () => {
  const stories = [
    { slug: 'a', blocked_by: ['a', 'not-in-batch'] },
    { slug: 'b', blocked_by: ['external/thing'] },
  ]
  assert.deepEqual(slugs(topologicalOrder(stories)), ['a', 'b'])
})

test('throws on a dependency cycle (fail-loud, names the members)', () => {
  const stories = [
    { slug: 'a', blocked_by: ['b'] },
    { slug: 'b', blocked_by: ['a'] },
  ]
  assert.throws(() => topologicalOrder(stories), /dependency cycle among in-batch stories \[a, b\]/)
})

test('diamond: both middles precede the join, single root leads', () => {
  const stories = [
    { slug: 'join', blocked_by: ['left', 'right'] },
    { slug: 'left', blocked_by: ['root'] },
    { slug: 'right', blocked_by: ['root'] },
    { slug: 'root' },
  ]
  const order = slugs(topologicalOrder(stories))
  assert.equal(order[0], 'root')
  assert.equal(order[3], 'join')
  assert.ok(order.indexOf('left') < order.indexOf('join'))
  assert.ok(order.indexOf('right') < order.indexOf('join'))
})
