import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The workflow runtime injects `agent`/`parallel`/`phase` as globals and the
// script has no module surface, so the review prompt — one review pass, not a
// review plus a self-check — is asserted against its source text.
const REVIEW_PROMPT_PATTERN = /function buildReviewPrompt\([\s\S]*?\n}/
const SELF_CHECK_PATTERN = /\b(confirm|verify|double-check|re-check)\b/i

function reviewPromptSource() {
  const source = readFileSync(
    fileURLToPath(new URL('./sprint_pipeline.js', import.meta.url)),
    'utf8',
  )
  return source.match(REVIEW_PROMPT_PATTERN)[0]
}

test('the review prompt tells the reviewer where the baseline lives', () => {
  assert.match(reviewPromptSource(), /the engineering baseline at \$\{baselinePath\}/)
})

test('the review prompt issues no self-check instruction alongside the review', () => {
  assert.doesNotMatch(reviewPromptSource(), SELF_CHECK_PATTERN)
})
