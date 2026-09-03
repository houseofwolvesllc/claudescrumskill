const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Three skills consume the pipeline's out-of-band `_telemetry` and render the
// same stage-timing section: sprint-status defines it, sprint-release and
// project-orchestrate reference that definition. These tests pin that the two
// downstream consumers read the same telemetry.report gate, render the section
// when true and omit it when false, and reference the sprint-status definition
// of the two run-level metrics rather than restating it (no-duplication).
const SKILLS = path.join(__dirname, '..', 'skills');

function read(skill) {
  return readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
}

const DOWNSTREAM_CONSUMERS = ['sprint-release', 'project-orchestrate'];

for (const consumer of DOWNSTREAM_CONSUMERS) {
  test(`${consumer} reads telemetry.report, defaulting to true when the key is absent`, () => {
    const content = read(consumer);
    assert.match(content, /telemetry\.report/);
    assert.match(content, /default[^.\n]*true/i);
  });

  test(`${consumer} renders the stage-timing section when telemetry.report is true`, () => {
    assert.match(read(consumer), /Stage Timing/i);
  });

  test(`${consumer} omits the stage-timing section when telemetry.report is false`, () => {
    assert.match(read(consumer), /`?false`?[^\n]*(omit|no[^\n]*section|not render)/i);
  });

  test(`${consumer} references the sprint-status metric definition instead of restating it`, () => {
    assert.match(read(consumer), /sprint-status/);
  });
}

test('the two run-level metrics are defined in exactly one skill (sprint-status)', () => {
  const definition = /max[^.\n]*endedAt[^.\n]*min[^.\n]*startedAt/i;
  const defining = ['sprint-status', ...DOWNSTREAM_CONSUMERS].filter((skill) =>
    definition.test(read(skill)),
  );
  assert.deepEqual(defining, ['sprint-status']);
});
