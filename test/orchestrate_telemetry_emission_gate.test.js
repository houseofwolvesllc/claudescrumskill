const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Stage-timing telemetry is captured in code but persisted and rendered by the
// orchestrator SKILL layer, which is soft instruction: a real run once completed
// Phase 3 and printed no timing report at all, because the orchestrating agent
// simply did not honor the persist step. A stronger sentence is not the fix — the
// Phase 2/3 completion gates work because they read the artifact against the run
// rather than trust the agent's account of it. The emission gate must do the same:
// a run cannot be reported complete without a fresh stage-timing artifact.
const SKILL = path.join(__dirname, '..', 'skills', 'project-orchestrate', 'SKILL.md');

function skillText() {
  return readFileSync(SKILL, 'utf8');
}

test('a completion gate guards stage-timing emission before the summary', () => {
  const text = skillText();

  const gateIndex = text.indexOf('Completion Gate — Stage-Timing Emission');
  assert.ok(gateIndex !== -1, 'the stage-timing emission completion gate is gone');

  const summaryIndex = text.indexOf('### Step 15: Completion Summary');
  assert.ok(summaryIndex !== -1, 'the completion summary heading is gone');
  assert.ok(gateIndex < summaryIndex, 'the emission gate must precede the completion summary');
});

test('the gate reads the artifact mtime against the run start, like the phase gates', () => {
  const gate = skillText().split('Completion Gate — Stage-Timing Emission')[1] ?? '';

  assert.match(gate, /reports\/stage-timing\/latest\.json/);
  assert.match(gate, /statSync/);
  assert.match(gate, /mtime at or after `Started`/);
  assert.match(gate, /cannot be reported complete/i);
});

test('the gate is scoped to when reporting is enabled', () => {
  const gate = skillText().split('Completion Gate — Stage-Timing Emission')[1] ?? '';

  assert.match(gate, /`telemetry\.report` is `true`/);
  assert.match(gate, /When `telemetry\.report` is `false`, this gate does not apply/);
});

test('persistence is gated on the report flag, so report:false writes nothing to disk', () => {
  const persist = skillText().split('#### Persist stage-timing telemetry')[1] ?? '';
  const block = persist.split('####')[0];

  assert.match(block, /gated on `telemetry\.report`/);
  assert.match(block, /When it is `false`, skip persistence/);
  assert.match(block, /capture is unconditional/);
});
