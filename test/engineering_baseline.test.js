const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASELINE_PATH = path.join(
  __dirname, '..', 'skills', 'shared', 'references', 'ENGINEERING_BASELINE.md',
);

const ARBITRATION_RULE = `**Simple design is the default. Abstractions, design patterns, and domain layers
are responses to demonstrated complexity — duplication, repeated change in one
place, or essential domain rules — never anticipatory architecture. Arrive at
patterns by refactoring toward them, not by designing to them.**

Every pattern, every layer, every abstraction must justify itself against this
rule. Three similar lines beat a premature abstraction. When in doubt, write the
simplest thing that works and let duplication or change-pressure tell you when to
extract.`;

const EMERGENCE_PRIORITIES = [
  '1. All tests pass. Untested code is unfinished code.',
  '2. No duplication. Every piece of knowledge has one authoritative representation.',
  '3. Code is expressive. The reader understands intent without asking the author.',
  '4. Minimal classes and methods. Don\'t create abstractions you don\'t need yet.',
];

// The baseline reinforces Clean Code and TDD rather than assuming them. A model
// that already knows the canon still benefits from having it in front of it at
// implementation time, and the project owner has decided that reinforcement is
// worth its per-agent cost. These markers are the load-bearing ones: if a future
// trim removes them, the baseline has stopped reinforcing and this fails.
const REINFORCED_CANON = [
  /Law of Demeter/i,
  /F\.I\.R\.S\.T\./i,
  /Red\s*(?:→|->)\s*Green\s*(?:→|->)\s*Refactor/i,
  /Boy Scout Rule/i,
  /Single Responsibility/i,
  /Command-query separation/i,
];

function baseline() {
  return fs.readFileSync(BASELINE_PATH, 'utf8');
}

test('the baseline states the Arbitration Rule verbatim', () => {
  assert.ok(baseline().includes(ARBITRATION_RULE), 'the Arbitration Rule was altered');
});

test('the baseline lists the four Emergence priorities in order', () => {
  assert.ok(baseline().includes(EMERGENCE_PRIORITIES.join('\n')), 'Emergence priorities changed');
});

test('the baseline states the order of precedence', () => {
  const markdown = baseline();

  // The clause wraps across lines in the prose, so match across whitespace.
  assert.match(markdown, /`CLAUDE\.md` > this baseline > situational\s+guidance/);
  assert.match(markdown, /never\s+overrides the Arbitration Rule/);
});

test('the baseline reinforces Clean Code and TDD canon', () => {
  const markdown = baseline();
  const missing = REINFORCED_CANON.filter(canon => !canon.test(markdown)).map(String);

  assert.deepEqual(missing, [], `canon missing from the baseline: ${missing.join(', ')}`);
});
