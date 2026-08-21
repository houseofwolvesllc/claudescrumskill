import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PLACEMENT_ATTEMPT_LIMIT,
  placementAttemptsRemain,
  placementRetryNotice,
  exhaustedPlacementDetail,
} from './retry_placement.mjs'

test('a story gets a second tree before its misplacement is called a failure', () => {
  assert.equal(PLACEMENT_ATTEMPT_LIMIT, 2)
  assert.equal(placementAttemptsRemain(1), true)
})

test('the attempts run out rather than retrying forever', () => {
  assert.equal(placementAttemptsRemain(2), false)
  assert.equal(placementAttemptsRemain(3), false)
})

test('a caller may bound the attempts itself', () => {
  assert.equal(placementAttemptsRemain(2, 3), true)
  assert.equal(placementAttemptsRemain(1, 1), false)
})

test('the retry notice names what HEAD printed, so a systematic misplacement reads as one', () => {
  const notice = placementRetryNotice({ storySlug: 'guard-adr', attempt: 1, observed: '8bd6874' })

  assert.match(notice, /guard-adr/)
  assert.match(notice, /attempt 1 of 2/)
  assert.match(notice, /8bd6874/)
})

test('the retry notice says the failure is placement, not a finding about the story', () => {
  const notice = placementRetryNotice({ storySlug: 's', attempt: 1, observed: 'abc' })

  assert.match(notice, /placement failure, not a finding/)
})

test('a stage that reported no head still produces a readable notice', () => {
  const notice = placementRetryNotice({ storySlug: 's', attempt: 1, observed: '' })

  assert.match(notice, /HEAD printed nothing/)
  assert.doesNotMatch(notice, /printed \)/)
})

test('the exhausted detail records that the misplacement survived the retries', () => {
  const detail = exhaustedPlacementDetail({ observed: '8bd6874' })

  assert.match(detail, /8bd6874/)
  assert.match(detail, /unchanged across 2 attempts/)
})

test('the exhausted detail never ends up naming nothing at all', () => {
  assert.match(exhaustedPlacementDetail({ observed: '' }), /^nothing/)
})
