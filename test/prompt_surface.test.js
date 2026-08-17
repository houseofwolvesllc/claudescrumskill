const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { findFiles } = require('../bin/install.js');

const REPO_ROOT = path.join(__dirname, '..');
const PROMPT_SURFACE_DIRS = [
  path.join(REPO_ROOT, 'skills'),
  path.join(REPO_ROOT, 'lib', 'guidance'),
];

// Thinking scaffolds are 4.8-era prompt tricks. Opus 5 thinks adaptively, so
// they buy nothing and cost a great deal of every run's budget.
const THINKING_SCAFFOLDS = [
  /ultrathink/i,
  /megathink/i,
  /think (?:step by step|hard|carefully|deeply)/i,
  /take a deep breath/i,
  /<\/?scratchpad>/i,
  /<\/?thinking>/i,
];

// Opus 5 verifies its own work unprompted, so asking it to check that work again
// buys a second pass of the same reasoning at full price.
const VERIFICATION_SCAFFOLDS = [
  /double[- ]check/i,
  /re-?verify/i,
  /(?:confirm|verify|check) your (?:own )?work/i,
];

function promptSurfaceFiles() {
  const isMarkdown = file => path.extname(file) === '.md';
  return PROMPT_SURFACE_DIRS.flatMap(dir => findFiles(dir, isMarkdown));
}

function filesCarrying(scaffolds) {
  const carries = markdown => scaffolds.some(scaffold => scaffold.test(markdown));
  return promptSurfaceFiles()
    .filter(file => carries(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(REPO_ROOT, file));
}

test('no prompt-surface markdown carries a thinking scaffold', () => {
  const offenders = filesCarrying(THINKING_SCAFFOLDS);

  assert.deepEqual(offenders, [], `thinking scaffolds remain in: ${offenders.join(', ')}`);
});

test('no prompt-surface markdown asks the model to re-check its own work', () => {
  const offenders = filesCarrying(VERIFICATION_SCAFFOLDS);

  assert.deepEqual(offenders, [], `verification scaffolds remain in: ${offenders.join(', ')}`);
});
