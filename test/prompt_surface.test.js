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

function promptSurfaceFiles() {
  const isMarkdown = file => path.extname(file) === '.md';
  return PROMPT_SURFACE_DIRS.flatMap(dir => findFiles(dir, isMarkdown));
}

function scaffoldsIn(markdown) {
  return THINKING_SCAFFOLDS.filter(scaffold => scaffold.test(markdown));
}

test('no prompt-surface markdown carries a thinking scaffold', () => {
  const offenders = promptSurfaceFiles()
    .filter(file => scaffoldsIn(fs.readFileSync(file, 'utf8')).length > 0)
    .map(file => path.relative(REPO_ROOT, file));

  assert.deepEqual(offenders, [], `thinking scaffolds remain in: ${offenders.join(', ')}`);
});
