const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// sprint-status renders the stage-timing section from the persisted artifact
// `.claude-scrum-skill/reports/stage-timing/latest.json` (written by
// project-orchestrate after each pipeline run), gated on config's
// telemetry.report and omitted when the artifact is absent. The two run-level
// metrics (summed-stage cost vs critical-path wall-clock) are defined here once
// so the other consumers reference the definition instead of restating it; these
// tests pin that the definitions, the invariant that relates them, and the gate
// survive edits.
const SKILL = path.join(__dirname, '..', 'skills', 'sprint-status', 'SKILL.md');

function skill() {
  return readFileSync(SKILL, 'utf8');
}

test('the skill reads telemetry.report from config, defaulting to true when the key is absent', () => {
  const content = skill();
  assert.match(content, /telemetry\.report/);
  assert.match(content, /default[^.\n]*true/i);
});

test('summed-stage cost is defined as the sum of each stage interval', () => {
  assert.match(skill(), /summed-stage cost/i);
  assert.match(skill(), /sum[^.\n]*endedAt\s*-\s*startedAt/i);
});

test('critical-path wall-clock is defined as max endedAt minus min startedAt', () => {
  assert.match(skill(), /critical-path wall-clock/i);
  assert.match(skill(), /max[^.\n]*endedAt[^.\n]*min[^.\n]*startedAt/i);
});

test('the section documents that wall-clock is at most summed cost when stages overlap', () => {
  assert.match(skill(), /wall-clock\s*<=\s*summed-stage cost/i);
  assert.match(skill(), /overlap/i);
});

test('the invariant accounts for idle gaps: wall-clock can exceed summed cost', () => {
  const content = skill();
  assert.match(content, /gap/i);
  assert.match(content, /wall-clock can exceed summed-stage cost/i);
});

test('equality holds only for strictly-sequential intervals with no gaps', () => {
  assert.match(skill(), /equal[^.\n]*sequential[^.\n]*no gap/i);
});

test('per phase and per label the section reports summed duration, count, and share', () => {
  const content = skill();
  assert.match(content, /phase/i);
  assert.match(content, /label/i);
  assert.match(content, /count/i);
  assert.match(content, /share/i);
});

test('interval durations are diffed with Date.parse over the ISO-8601 timestamps', () => {
  assert.match(skill(), /Date\.parse/);
});

test('the section is sourced from the persisted latest.json artifact', () => {
  assert.match(skill(), /reports\/stage-timing\/latest\.json/);
});

test('when telemetry.report is false the timing section is omitted', () => {
  assert.match(skill(), /`?false`?[^\n]*(omit|no[^\n]*section|not render)/i);
});

test('when the persisted artifact is absent the section is omitted gracefully', () => {
  const content = skill();
  assert.match(content, /absent[^\n]*(omit|no[^\n]*section)/i);
});
