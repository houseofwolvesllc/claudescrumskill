const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// The skills that invoke a workflow whose stages can be defined relative to the
// session tier. Their invocation blocks are the contract the orchestrator fills in.
const INVOKING_SKILLS = ['project-orchestrate', 'project-emulate', 'project-scaffold'];

const MODEL_TIERS = ['haiku', 'sonnet', 'opus'];

// The invocation block is the YAML fence under a SKILL.md's "#### Invocation" heading.
const INVOCATION_BLOCK_PATTERN = /^#### Invocation\b.*?^```yaml\n(.*?)^```/ms;

// One contract entry: its `key:` line plus the continuation lines indented beneath it.
const SESSION_MODEL_ENTRY_PATTERN = /^sessionModel:.*(?:\n[ \t]+\S.*)*/m;

// Absent the argument, a relative stage falls back to the session tier with no
// signal — the silent inheritance this contract exists to make visible.
const SILENT_INHERIT_PATTERN = /omit it and .*inherits? the session tier silently/is;

function sessionModelContract(skill) {
  const skillPath = path.join(REPO_ROOT, 'skills', skill, 'SKILL.md');
  const block = fs.readFileSync(skillPath, 'utf8').match(INVOCATION_BLOCK_PATTERN);
  assert.ok(block, `${skill}/SKILL.md has no YAML invocation block`);

  const entry = block[1].match(SESSION_MODEL_ENTRY_PATTERN);
  assert.ok(entry, `${skill}/SKILL.md does not document sessionModel in its invocation block`);
  return entry[0];
}

test('every workflow invocation contract offers sessionModel as an optional argument', () => {
  for (const skill of INVOKING_SKILLS) {
    assert.match(sessionModelContract(skill), /optional/i, `${skill} makes sessionModel required`);
  }
});

test('every sessionModel contract line names the accepted model tiers', () => {
  for (const skill of INVOKING_SKILLS) {
    const contract = sessionModelContract(skill);
    const unnamed = MODEL_TIERS.filter(tier => !contract.includes(`'${tier}'`));

    assert.deepEqual(unnamed, [], `${skill} omits the accepted tiers: ${unnamed.join(', ')}`);
  }
});

test('every sessionModel contract line states that omitting it inherits the session tier silently', () => {
  for (const skill of INVOKING_SKILLS) {
    const contract = sessionModelContract(skill);

    assert.match(contract, SILENT_INHERIT_PATTERN, `${skill} leaves the cost of omission unstated`);
  }
});
