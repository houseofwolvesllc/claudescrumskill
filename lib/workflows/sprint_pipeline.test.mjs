import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The workflow runtime injects `agent`/`parallel`/`phase` as globals and the
// script has no module surface, so what the script does with them — one review
// pass, not a review plus a self-check; a fan-out bound taken in the one order
// that cannot deadlock — is asserted against its source text.
const REVIEW_PROMPT_PATTERN = /function buildReviewPrompt\([\s\S]*?\n}/
const LAYOUT_PROBE_PATTERN = /async function probeRepoLayout\([\s\S]*?\n}/
const RUN_STORY_PATTERN = /async function runStory\([\s\S]*?\n}/
const SELF_CHECK_PATTERN = /\b(confirm|verify|double-check|re-check)\b/i

function pipelineSource() {
  return readFileSync(fileURLToPath(new URL('./sprint_pipeline.js', import.meta.url)), 'utf8')
}

function sourceOf(pattern) {
  return pipelineSource().match(pattern)[0]
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
