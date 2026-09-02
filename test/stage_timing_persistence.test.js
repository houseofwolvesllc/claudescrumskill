const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Stage-timing telemetry is persisted by the orchestrator SKILL layer — which
// can write files, unlike the workflow runtime (ADR-0006) — to a durable
// artifact after each pipeline run. sprint-status and sprint-release then render
// from that persisted artifact rather than an in-memory `_telemetry` they cannot
// see, and omit the section when the artifact is absent. project-orchestrate
// still renders from its own live `_telemetry`. These tests pin the persist step
// and the two consumers' shift to the persisted source.
const SKILLS = path.join(__dirname, '..', 'skills');

function read(skill) {
  return readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
}

test('project-orchestrate persists _telemetry to the stable latest.json artifact', () => {
  const content = read('project-orchestrate');
  assert.match(content, /reports\/stage-timing\/latest\.json/);
  assert.match(content, /_telemetry/);
});

test('project-orchestrate writes a timestamped sibling alongside latest.json', () => {
  assert.match(read('project-orchestrate'), /timestamp/i);
});

test('project-orchestrate persists in the SKILL layer, not the workflow runtime', () => {
  assert.match(read('project-orchestrate'), /ADR-0006/);
});

test('project-orchestrate still renders from its live _telemetry', () => {
  assert.match(read('project-orchestrate'), /live[^\n]*_telemetry/i);
});

for (const consumer of ['sprint-status', 'sprint-release']) {
  test(`${consumer} sources the section from the persisted latest.json artifact`, () => {
    assert.match(read(consumer), /reports\/stage-timing\/latest\.json/);
  });

  test(`${consumer} omits the section when the persisted artifact is absent`, () => {
    assert.match(read(consumer), /absent[^\n]*(omit|no[^\n]*section)/i);
  });
}
