import { test } from 'node:test'
import assert from 'node:assert/strict'

import { artifactIsFresh } from './artifact_freshness.mjs'

const PHASE_STARTED_AT = '2026-08-20T17:00:00.000Z'

const NO_MTIME = ''

const freshnessOf = artifactModifiedAt =>
  artifactIsFresh({ phaseStartedAt: PHASE_STARTED_AT, artifactModifiedAt })

// ---- the phase wrote its artifact ----

test('an artifact written after the phase began is fresh', () => {
  assert.equal(freshnessOf('2026-08-20T17:04:31.000Z'), true)
})

test('an artifact written in the same instant the phase began is fresh', () => {
  assert.equal(freshnessOf(PHASE_STARTED_AT), true)
})

// ---- the phase did not write its artifact ----

test('an artifact whose mtime predates the phase start is not fresh', () => {
  assert.equal(freshnessOf('2026-08-20T16:59:59.999Z'), false)
})

test('an artifact left behind by an earlier run is not fresh', () => {
  assert.equal(freshnessOf('2026-07-30T09:12:00.000Z'), false)
})

// ---- the comparison could not be made ----

test('a missing artifact, which the probe answers with no mtime, is not fresh', () => {
  assert.equal(freshnessOf(NO_MTIME), false)
})

test('an artifact whose mtime no probe measured is not fresh', () => {
  assert.equal(freshnessOf(undefined), false)
})

test('an unmeasured phase start leaves nothing to compare against, so nothing is fresh', () => {
  assert.equal(artifactIsFresh({ artifactModifiedAt: '2026-08-20T17:04:31.000Z' }), false)
})

test('a timestamp that is not a readable time is not fresh', () => {
  assert.equal(freshnessOf('some time last week'), false)
})
