import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findingLabels, findingLabel } from './describe_finding.mjs'

// The shape a review agent actually returns, observed in a live run.
const REAL_FINDING = {
  file: 'test/shared_module_tests.test.js',
  line: 5,
  short_summary: 'require() cannot load .mjs ES modules—test will crash',
  summary: 'The test uses require() to load an ES module, which throws at runtime.',
  failure_scenario: 'node --test crashes on load',
  verdict: 'CONFIRMED',
}

test('labels a finding by its short summary, because the blocker list is scanned', () => {
  assert.equal(findingLabel(REAL_FINDING), 'require() cannot load .mjs ES modules—test will crash')
})

test('falls back to the full sentence when there is no short summary', () => {
  const { short_summary, ...withoutShort } = REAL_FINDING

  assert.equal(findingLabel(withoutShort), 'The test uses require() to load an ES module, which throws at runtime.')
})

test('falls back to the file when the finding carries no prose at all', () => {
  assert.equal(findingLabel({ file: 'lib/x.mjs', line: 3 }), 'lib/x.mjs')
})

test('still produces a line for a finding that describes nothing — a silent gap is how a blocker goes missing', () => {
  assert.equal(findingLabel({}), 'an unlabelled finding')
  assert.equal(findingLabel(null), 'an unlabelled finding')
})

test('ignores a field that is present but blank rather than labelling a story with whitespace', () => {
  assert.equal(findingLabel({ short_summary: '   ', summary: 'the real one' }), 'the real one')
})

test('lists criticals before warnings, which is the order they are acted on', () => {
  const labels = findingLabels({
    critical: [{ short_summary: 'crit-a' }],
    warning: [{ short_summary: 'warn-a' }],
    info: [{ short_summary: 'info-a' }],
  })

  assert.deepEqual(labels, ['crit-a', 'warn-a'])
})

test('never reports info as a blocker — it did not block anything', () => {
  assert.deepEqual(findingLabels({ critical: [], warning: [], info: [{ short_summary: 'fyi' }] }), [])
})

test('no label is ever null, which is what the defect produced', () => {
  const labels = findingLabels({ critical: [REAL_FINDING, {}], warning: [null] })

  assert.equal(labels.length, 3)
  assert.ok(labels.every(label => typeof label === 'string' && label.length > 0))
})

test('tolerates missing, empty, and malformed severity lists', () => {
  assert.deepEqual(findingLabels(undefined), [])
  assert.deepEqual(findingLabels({}), [])
  assert.deepEqual(findingLabels({ critical: 'not an array' }), [])
})
