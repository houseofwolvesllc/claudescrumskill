import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The workflow runtime injects `agent`/`parallel`/`phase` as globals and the
// script has no module surface, so what the script does with them — one review
// pass, not a review plus a self-check; a fan-out bound taken in the one order
// that cannot deadlock — is asserted against its source text.
const REVIEW_PROMPT_PATTERN = /function buildReviewPrompt\([\s\S]*?\n}/
const IMPLEMENT_PROMPT_PATTERN = /function buildImplementPrompt\([\s\S]*?\n}/
const LAYOUT_PROBE_PATTERN = /async function probeRepoLayout\([\s\S]*?\n}/
const RUN_STORY_PATTERN = /async function runStory\([\s\S]*?\n}/
const RUN_STORY_CHAIN_PATTERN = /async function runStoryChain\([\s\S]*?\n}/
const CHAIN_OUTCOME_PATTERN = /function chainOutcome\([\s\S]*?\n}/
const SPRINT_STORY_RETURN_SCHEMA_PATTERN = /const SPRINT_STORY_RETURN_SCHEMA = \{[\s\S]*?\n}/
const SELF_CHECK_PATTERN = /\b(confirm|verify|double-check|re-check)\b/i
// The epic a story branch carries between `story/` and the slug: the
// interpolation in code, or the placeholder where a comment documents the shape.
const EPIC_SEGMENT_PATTERN = /(\$\{epicSlug\}|<epicSlug>)\//
const UNNAMESPACED_STORY_BRANCH_PATTERN = new RegExp(`story/(?!${EPIC_SEGMENT_PATTERN.source})`)

function pipelineSource() {
  return readFileSync(fileURLToPath(new URL('./sprint_pipeline.js', import.meta.url)), 'utf8')
}

function sourceOf(pattern) {
  return pipelineSource().match(pattern)[0]
}

function linesNamingAnUnnamespacedStoryBranch() {
  return pipelineSource()
    .split('\n')
    .filter(line => UNNAMESPACED_STORY_BRANCH_PATTERN.test(line))
    .map(line => line.trim())
}

test('the review prompt tells the reviewer where the baseline lives', () => {
  assert.match(sourceOf(REVIEW_PROMPT_PATTERN), /the engineering baseline at \$\{baselinePath\}/)
})

test('the review prompt issues no self-check instruction alongside the review', () => {
  assert.doesNotMatch(sourceOf(REVIEW_PROMPT_PATTERN), SELF_CHECK_PATTERN)
})

test('the layout probe asks for the disk and core facts the fan-out bound is resolved from', () => {
  const probe = sourceOf(LAYOUT_PROBE_PATTERN)

  assert.match(probe, /availableDiskBytes/)
  assert.match(probe, /dependencyDirectoryBytes/)
  assert.match(probe, /cpuCores/)
  assert.match(probe, /Report 0 for any of the last three you could not measure/)
})

test('a story takes its worktree slot only after its in-batch blockers have cleared', () => {
  // Reversing these two deadlocks the batch: a dependent holding a slot while it
  // waits for a blocker that has not started starves the blocker of slots.
  const runStory = sourceOf(RUN_STORY_PATTERN)

  assert.ok(runStory.indexOf('unmetInBatchBlockers') < runStory.indexOf('withWorktreeSlot'))
})

test('the return schema offers the infrastructure failure alongside the story’s own', () => {
  assert.match(sourceOf(SPRINT_STORY_RETURN_SCHEMA_PATTERN), /'done', 'blocked', 'failed', 'infrastructure-failed'/)
})

test('the implement prompt tells a worktree that cannot obtain dependencies to report, not implement', () => {
  const prompt = sourceOf(IMPLEMENT_PROMPT_PATTERN)

  assert.match(prompt, /dependencySetupFailure/)
  assert.match(prompt, /not a failure of this story's code/)
})

test('a story whose worktree never obtained its dependencies stops before the review stage', () => {
  // Reviewing a story whose code never ran would spend a review pass on a tree
  // that was never provisioned.
  const chain = sourceOf(RUN_STORY_CHAIN_PATTERN)

  assert.match(chain, /dependencySetupFailed/)
  assert.ok(chain.indexOf('dependencySetupFailed') < chain.indexOf('buildReviewPrompt'))
})

test('no story branch is named without its epic prefix', () => {
  // Two epics in flight can carry stories with the same slug. Under a flat
  // `story/<slug>` both runs drive one ref and the last writer wins, which is
  // how a real run lost a branch — so the epic sits between the two everywhere.
  const offenders = linesNamingAnUnnamespacedStoryBranch()

  assert.deepEqual(offenders, [], `story branches missing their epic prefix:\n${offenders.join('\n')}`)
})

test('an unhandled error in a story chain is still the story’s own failure', () => {
  assert.match(sourceOf(CHAIN_OUTCOME_PATTERN), /codeFailure\(/)
})
