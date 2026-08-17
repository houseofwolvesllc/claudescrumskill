import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The workflow runtime injects `agent`/`parallel`/`phase` as globals and the
// script has no module surface, so its per-finding agent budget — the whole
// point of the two-agent design — is asserted against the source text.
const AGENT_LABEL_PATTERN = /label: `([a-z]+):\$\{finding\.id\}`/g

function agentStagesPerFinding() {
  const source = readFileSync(
    fileURLToPath(new URL('./adversarial_verify.js', import.meta.url)),
    'utf8',
  )
  return [...source.matchAll(AGENT_LABEL_PATTERN)].map(([, stage]) => stage)
}

test('adversarial_verify spends two agents per finding: skeptic then judge', () => {
  assert.deepEqual(agentStagesPerFinding(), ['skeptic', 'judge'])
})
