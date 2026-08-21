import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

// The workflow runtime injects `agent` as a global and the scripts have no
// module surface, so the tier each stage runs at is asserted against the source
// text: every agent() call site spreads resolveAgentTier('<stage>'), and what
// that stage costs is resolve_agent_tier.test.mjs's subject.
//
// The spread is the tier marker, and it is required even of a stage that
// deliberately runs at the session's own model and effort: that inheritance is
// declared once in STAGE_TIERS (both targets `session`), never by leaving a
// call site bare. An absent spread therefore always means the stage silently
// inherits whatever the operator's session costs — the defect this file forbids.
const TIERED_STAGE_PATTERN = /\.\.\.resolveAgentTier\('([a-z-]+)'/g

// The same spread with its options object captured: the second argument is what
// carries the session model and, where there is one, the story being worked.
const TIER_OPTIONS_PATTERN = /\.\.\.resolveAgentTier\('([a-z-]+)', \{([^}]*)\}\)/g

// A call site opens with `agent(` and a first argument, which is what separates
// it from the bare `agent()` the tiering comments write in prose.
const AGENT_CALL_PATTERN = /\bagent\(\s*[^)\s]/g
const LABEL_PATTERN = /label: [`']([a-z-]+)/
const UNLABELED_STAGE = '(unlabeled)'

const WORKFLOWS_DIR = new URL('./', import.meta.url)

function shippedWorkflows() {
  return readdirSync(WORKFLOWS_DIR).filter(name => name.endsWith('.js'))
}

// Each call site owns the source from its own `agent(` to the next one, so a
// tier spread counts for the call it follows and for no other.
function untieredStages(source) {
  const callSites = [...source.matchAll(AGENT_CALL_PATTERN)].map(({ index }) => index)
  return callSites
    .map((start, position) => source.slice(start, callSites[position + 1]))
    .filter(callSite => !declaresTier(callSite))
    .map(stageNamedByLabel)
}

function declaresTier(callSite) {
  return callSite.match(TIERED_STAGE_PATTERN) !== null
}

function stageNamedByLabel(callSite) {
  const [, stage] = callSite.match(LABEL_PATTERN) || []
  return stage || UNLABELED_STAGE
}

function tieredStages(script) {
  return [...readScript(script).matchAll(TIERED_STAGE_PATTERN)].map(([, stage]) => stage)
}

function storyAwareStages(script) {
  return [...readScript(script).matchAll(TIER_OPTIONS_PATTERN)]
    .filter(([, , options]) => options.includes('story'))
    .map(([, stage]) => stage)
}

function readScript(script) {
  return readFileSync(new URL(script, WORKFLOWS_DIR), 'utf8')
}

test('no workflow lets an agent call inherit the session tier by omission', () => {
  for (const script of shippedWorkflows()) {
    const untiered = untieredStages(readScript(script))
    assert.deepEqual(
      untiered,
      [],
      `lib/workflows/${script}: agent calls declaring no tier: ${untiered.join(', ')}`,
    )
  }
})

test('sprint_pipeline tiers every stage of the per-story chain', () => {
  assert.deepEqual(tieredStages('sprint_pipeline.js'), [
    'detect-layout',
    'implement',
    'review',
    // Order follows source layout, not execution: the stepdown rule puts
    // verifyStory below runStoryChain, so its agent call reads after the PR
    // stage's even though it runs before it.
    'pr',
    'verify',
    'reset',
    // Teardown is two calls, not one: the first reports git's worktree listing
    // and the second removes the paths the pipeline selected from it. Splitting
    // them is what keeps the selection rule in code rather than in a prompt.
    'teardown',
    'teardown',
  ])
})

// The stages that work the story itself resolve their tier with that story in
// hand, because how hard the story is — and whether it may tier down at all —
// is a property of the story. The chain's finalize step opens a PR for a branch
// and the batch-level stages run before any story is picked up: both are
// mechanical whatever the story weighs, so neither is given one.
const STORY_WORKING_STAGES = ['implement', 'review', 'verify']

test('sprint_pipeline resolves the tier of each story-working stage with that story', () => {
  assert.deepEqual(storyAwareStages('sprint_pipeline.js'), STORY_WORKING_STAGES)
})

test('adversarial_verify tiers both stages of the per-finding chain', () => {
  assert.deepEqual(tieredStages('adversarial_verify.js'), ['skeptic', 'judge'])
})

test('elaborate_epics tiers its elaboration stage', () => {
  assert.deepEqual(tieredStages('elaborate_epics.js'), ['elaborate'])
})

test('the workflows that work findings and epics rather than stories supply no story', () => {
  assert.deepEqual(storyAwareStages('adversarial_verify.js'), [])
  assert.deepEqual(storyAwareStages('elaborate_epics.js'), [])
})

const UNTIERED_CALL = `
  const pr = await agent(buildOpenPRPrompt(story), {
    label: \`pr:\${story.slug}\`,
    phase: 'Open PR',
  })
`
const INHERITING_CALL = `
  const impl = await agent(buildImplementPrompt(story), {
    label: \`impl:\${story.slug}\`,
    phase: 'Implement',
    ...resolveAgentTier('implement', { sessionModel }),
  })
`

test('an agent call with no tier spread is reported by the stage its label names', () => {
  assert.deepEqual(untieredStages(UNTIERED_CALL), ['pr'])
})

test('an agent call whose stage deliberately inherits the session counts as tiered', () => {
  assert.deepEqual(untieredStages(INHERITING_CALL), [])
})
