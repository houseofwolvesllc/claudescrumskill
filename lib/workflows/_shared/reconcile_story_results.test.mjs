import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reconcileStoryResults } from './reconcile_story_results.mjs'

const BATCH = ['first-story', 'second-story', 'third-story']

const requested = slugs => slugs.map(slug => ({ slug }))
const returnedDone = slugs => slugs.map(storySlug => ({ storySlug, status: 'done' }))

const reportFor = (asked, came) =>
  reconcileStoryResults({ requested: requested(asked), returned: came })

// ---- every requested story came back ----

test('a batch whose every requested story came back reports the count it reconciled', () => {
  assert.match(reportFor(BATCH, returnedDone(BATCH)), /all 3 requested stories/i)
})

test('a complete batch names no story as unaccounted for', () => {
  const report = reportFor(BATCH, returnedDone(BATCH))

  for (const slug of BATCH) assert.doesNotMatch(report, new RegExp(slug))
})

// ---- fewer results came back than were asked for ----

test('a truncated batch names every story nothing came back for', () => {
  const report = reportFor(BATCH, returnedDone(['first-story']))

  assert.match(report, /second-story/)
  assert.match(report, /third-story/)
})

test('a truncated batch counts the results it is short against the batch it was asked for', () => {
  assert.match(reportFor(BATCH, returnedDone(['first-story'])), /2 of 3/)
})

test('a truncated batch does not read as a completed one', () => {
  const report = reportFor(BATCH, returnedDone(['first-story']))

  assert.match(report, /INCOMPLETE BATCH/)
  assert.doesNotMatch(report, /all \d+ requested stories/i)
})

// ---- the results that came back did not succeed ----

test('blocked and failed stories count as reported', () => {
  const returned = [
    { storySlug: 'first-story', status: 'done' },
    { storySlug: 'second-story', status: 'blocked' },
    { storySlug: 'third-story', status: 'failed' },
  ]

  assert.match(reportFor(BATCH, returned), /all 3 requested stories/i)
})

test('a story absent from a batch of blocked and failed results is still named', () => {
  const returned = [
    { storySlug: 'first-story', status: 'blocked' },
    { storySlug: 'second-story', status: 'failed' },
  ]
  const report = reportFor(BATCH, returned)

  assert.match(report, /INCOMPLETE BATCH/)
  assert.match(report, /third-story/)
})
