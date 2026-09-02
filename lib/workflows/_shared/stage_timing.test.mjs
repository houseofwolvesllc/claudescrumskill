import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createStageTimer } from './stage_timing.mjs'

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const echoAgent = async prompt => prompt

// ---- one call records one interval ----

test('a call records exactly one interval', async () => {
  const { timedAgent, timings } = createStageTimer(echoAgent)

  await timedAgent('do the thing', { label: 'implement', phase: 'sprint' })

  assert.equal(timings.length, 1)
})

test('the interval carries the call\'s own label and phase', async () => {
  const { timedAgent, timings } = createStageTimer(echoAgent)

  await timedAgent('do the thing', { label: 'implement', phase: 'sprint' })

  assert.equal(timings[0].label, 'implement')
  assert.equal(timings[0].phase, 'sprint')
})

test('the interval stamps startedAt before endedAt in ISO-8601', async () => {
  const { timedAgent, timings } = createStageTimer(echoAgent)

  await timedAgent('do the thing', { label: 'implement', phase: 'sprint' })

  const { startedAt, endedAt } = timings[0]
  assert.match(startedAt, ISO_8601)
  assert.match(endedAt, ISO_8601)
  assert.ok(Date.parse(startedAt) <= Date.parse(endedAt))
})

// ---- the result passes through untouched ----

test('the awaited result is returned unchanged', async () => {
  const result = { entries: [1, 2, 3] }
  const { timedAgent } = createStageTimer(async () => result)

  const returned = await timedAgent('probe', { label: 'verify', phase: 'sprint' })

  assert.equal(returned, result)
})

test('a null result is returned unchanged and still records one interval', async () => {
  const { timedAgent, timings } = createStageTimer(async () => null)

  const returned = await timedAgent('probe', { label: 'verify', phase: 'sprint' })

  assert.equal(returned, null)
  assert.equal(timings.length, 1)
})

// ---- the throw path records and re-throws ----

test('a thrown error is re-thrown while the interval is still recorded', async () => {
  const failure = new Error('agent exploded')
  const { timedAgent, timings } = createStageTimer(async () => {
    throw failure
  })

  await assert.rejects(
    timedAgent('probe', { label: 'implement', phase: 'sprint' }),
    err => err === failure,
  )
  assert.equal(timings.length, 1)
  assert.match(timings[0].endedAt, ISO_8601)
})

// ---- intervals accumulate ----

test('intervals accumulate across multiple sequential calls', async () => {
  const { timedAgent, timings } = createStageTimer(echoAgent)

  await timedAgent('one', { label: 'implement', phase: 'sprint' })
  await timedAgent('two', { label: 'review', phase: 'sprint' })
  await timedAgent('three', { label: 'verify', phase: 'sprint' })

  assert.deepEqual(
    timings.map(interval => interval.label),
    ['implement', 'review', 'verify'],
  )
})

test('intervals accumulate across concurrent calls', async () => {
  const { timedAgent, timings } = createStageTimer(echoAgent)

  await Promise.all([
    timedAgent('one', { label: 'implement', phase: 'sprint' }),
    timedAgent('two', { label: 'review', phase: 'sprint' }),
    timedAgent('three', { label: 'verify', phase: 'sprint' }),
  ])

  assert.equal(timings.length, 3)
})

// ---- an empty run ----

test('a run with no calls yields no intervals', () => {
  const { timings } = createStageTimer(echoAgent)

  assert.deepEqual(timings, [])
})
