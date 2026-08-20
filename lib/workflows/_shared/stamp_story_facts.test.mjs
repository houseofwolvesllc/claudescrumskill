import { test } from 'node:test'
import assert from 'node:assert/strict'

import { stampStoryFacts, storyFactDisagreements } from './stamp_story_facts.mjs'

const ASSIGNED = { storySlug: 'guard-adr', branch: 'story/teardown-proof/guard-adr' }

// The shape actually observed: the PR agent reported the merge target as the
// story's branch, so the batch record disagreed with git.
const REPORTED_MERGE_TARGET = {
  storySlug: 'guard-adr',
  status: 'done',
  branch: 'release/teardown-proof',
  commits: ['abc1234'],
}

test('stamps the branch the pipeline assigned over the one the agent reported', () => {
  const stamped = stampStoryFacts(REPORTED_MERGE_TARGET, ASSIGNED)

  assert.equal(stamped.branch, 'story/teardown-proof/guard-adr')
})

test('leaves status, commits, and blockers alone — those are the agent’s own observation', () => {
  const stamped = stampStoryFacts({ ...REPORTED_MERGE_TARGET, blockers: ['x'] }, ASSIGNED)

  assert.equal(stamped.status, 'done')
  assert.deepEqual(stamped.commits, ['abc1234'])
  assert.deepEqual(stamped.blockers, ['x'])
})

test('stamps a slug the agent got wrong, so a record cannot be filed under another story', () => {
  const stamped = stampStoryFacts({ ...REPORTED_MERGE_TARGET, storySlug: 'some-other-story' }, ASSIGNED)

  assert.equal(stamped.storySlug, 'guard-adr')
})

test('fills in a field the agent omitted entirely', () => {
  const stamped = stampStoryFacts({ status: 'done' }, ASSIGNED)

  assert.equal(stamped.branch, 'story/teardown-proof/guard-adr')
  assert.equal(stamped.storySlug, 'guard-adr')
})

test('reports the branch disagreement, naming both what was reported and what was assigned', () => {
  const [only] = storyFactDisagreements(REPORTED_MERGE_TARGET, ASSIGNED)

  assert.match(only, /^branch: /)
  assert.match(only, /release\/teardown-proof/)
  assert.match(only, /story\/teardown-proof\/guard-adr/)
})

test('reports nothing when the agent’s record already agreed', () => {
  const agreeing = { ...REPORTED_MERGE_TARGET, branch: ASSIGNED.branch }

  assert.deepEqual(storyFactDisagreements(agreeing, ASSIGNED), [])
})

test('an omitted field is not a disagreement — there was no claim to disagree with', () => {
  assert.deepEqual(storyFactDisagreements({ status: 'done' }, ASSIGNED), [])
})

test('reports both fields when the agent got both wrong', () => {
  const wrong = { storySlug: 'other', branch: 'main' }

  assert.equal(storyFactDisagreements(wrong, ASSIGNED).length, 2)
})

test('tolerates a missing record rather than throwing on a dead agent', () => {
  assert.deepEqual(storyFactDisagreements(null, ASSIGNED), [])
  assert.deepEqual(stampStoryFacts(null, ASSIGNED), ASSIGNED)
})
