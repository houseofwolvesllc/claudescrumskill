import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveAgentTier } from './resolve_agent_tier.mjs'

test('detect-layout runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('detect-layout', 'opus'), { model: 'haiku', effort: 'low' })
})

test('reset runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('reset', 'opus'), { model: 'haiku', effort: 'low' })
})

test('pr runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('pr', 'opus'), { model: 'haiku', effort: 'low' })
})

test('implement inherits the session model and the session effort (sets neither)', () => {
  assert.deepEqual(resolveAgentTier('implement', 'opus'), {})
})

test('verify inherits the session model but pins low effort', () => {
  assert.deepEqual(resolveAgentTier('verify', 'opus'), { effort: 'low' })
})

test('elaborate inherits the session model but pins medium effort', () => {
  assert.deepEqual(resolveAgentTier('elaborate', 'opus'), { effort: 'medium' })
})

test('review runs one tier down from the session model at medium effort', () => {
  assert.deepEqual(resolveAgentTier('review', 'opus'), { model: 'sonnet', effort: 'medium' })
})

test('skeptic runs one tier down from the session model at medium effort', () => {
  assert.deepEqual(resolveAgentTier('skeptic', 'opus'), { model: 'sonnet', effort: 'medium' })
})

test('judge runs one tier down from the session model at medium effort', () => {
  assert.deepEqual(resolveAgentTier('judge', 'opus'), { model: 'sonnet', effort: 'medium' })
})

test('a one-tier-down stage steps opus to sonnet, and sonnet to haiku', () => {
  assert.equal(resolveAgentTier('review', 'opus').model, 'sonnet')
  assert.equal(resolveAgentTier('review', 'sonnet').model, 'haiku')
})

test('a one-tier-down stage stays at the session model when the session is already cheapest', () => {
  assert.deepEqual(resolveAgentTier('judge', 'haiku'), { model: 'haiku', effort: 'medium' })
})

test('a cheapest-tier stage stays at the session model when the session is already cheapest', () => {
  assert.deepEqual(resolveAgentTier('pr', 'haiku'), { model: 'haiku', effort: 'low' })
})

test('a one-tier-down stage inherits the session model when the session model is unrecognized', () => {
  assert.deepEqual(resolveAgentTier('review', 'some-future-model'), { effort: 'medium' })
})

test('a one-tier-down stage inherits the session model when no session model is supplied', () => {
  assert.deepEqual(resolveAgentTier('review'), { effort: 'medium' })
})

test('a cheapest-tier stage still tiers down when no session model is supplied', () => {
  assert.deepEqual(resolveAgentTier('detect-layout'), { model: 'haiku', effort: 'low' })
})

test('an unknown stage throws and names the stages it knows', () => {
  assert.throws(
    () => resolveAgentTier('lens', 'opus'),
    /resolveAgentTier: unknown stage 'lens'\. Known stages: .*\bjudge\b/,
  )
})
