const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASELINE_PATH = path.join(
  __dirname, '..', 'skills', 'shared', 'references', 'ENGINEERING_BASELINE.md',
);

// The baseline is injected into every implementation, review, and hardening
// subagent, so its length is paid once per agent in the fan-out. It carries only
// the project's own stance; Clean Code and TDD canon is knowledge the model
// already has and must not be restated here.
const WORD_CEILING = 180;

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

// Canon the target model already knows — restating it buys nothing per agent.
const RESTATED_CANON = [
  /Hungarian notation/i,
  /stepdown rule/i,
  /command-query separation/i,
  /law of demeter/i,
  /boy scout rule/i,
  /red\s*(?:→|->)\s*green\s*(?:→|->)\s*refactor/i,
  /F\.I\.R\.S\.T\./i,
  /three laws/i,
];

function baseline() {
  return fs.readFileSync(BASELINE_PATH, 'utf8');
}

function wordCount(markdown) {
  return markdown.split(/\s+/).filter(word => /[A-Za-z0-9]/.test(word)).length;
}

test('the baseline stays short enough to inject into every subagent', () => {
  const words = wordCount(baseline());

  assert.ok(words <= WORD_CEILING, `baseline is ${words} words, ceiling is ${WORD_CEILING}`);
});

test('the baseline states the Arbitration Rule verbatim', () => {
  assert.ok(baseline().includes(ARBITRATION_RULE), 'the Arbitration Rule was altered');
});

test('the baseline lists the four Emergence priorities in order', () => {
  assert.ok(baseline().includes(EMERGENCE_PRIORITIES.join('\n')), 'Emergence priorities changed');
});

test('the baseline states the order of precedence', () => {
  const markdown = baseline();

  assert.match(markdown, /`CLAUDE\.md` > this baseline > situational guidance/);
  assert.match(markdown, /never overrides the Arbitration Rule/);
});

test('the baseline restates no Clean Code or TDD canon', () => {
  const markdown = baseline();
  const restatements = RESTATED_CANON.filter(canon => canon.test(markdown)).map(String);

  assert.deepEqual(restatements, [], `canon restated in the baseline: ${restatements.join(', ')}`);
});
