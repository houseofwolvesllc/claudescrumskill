import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The workflow runtime injects `agent` as a global and the scripts have no
// module surface, so the tier each stage runs at is asserted against the source
// text: every agent() call site spreads resolveAgentTier('<stage>'), and what
// that stage costs is resolve_agent_tier.test.mjs's subject.
const TIERED_STAGE_PATTERN = /\.\.\.resolveAgentTier\('([a-z-]+)'/g

function tieredStages(script) {
  const source = readFileSync(fileURLToPath(new URL(`./${script}`, import.meta.url)), 'utf8')
  return [...source.matchAll(TIERED_STAGE_PATTERN)].map(([, stage]) => stage)
}

test('sprint_pipeline tiers every stage of the per-story chain', () => {
  assert.deepEqual(tieredStages('sprint_pipeline.js'), [
    'detect-layout',
    'implement',
    'review',
    'verify',
    'pr',
    'reset',
  ])
})

test('adversarial_verify tiers both stages of the per-finding chain', () => {
  assert.deepEqual(tieredStages('adversarial_verify.js'), ['skeptic', 'judge'])
})

test('elaborate_epics tiers its elaboration stage', () => {
  assert.deepEqual(tieredStages('elaborate_epics.js'), ['elaborate'])
})
