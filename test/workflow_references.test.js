const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { findFiles } = require('../bin/install.js');

const REPO_ROOT = path.join(__dirname, '..');
const WORKFLOWS_DIR = path.join(REPO_ROOT, 'lib', 'workflows');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const README_PATH = path.join(REPO_ROOT, 'README.md');

// How a SKILL.md names the workflow it invokes: `<skills-root>/_workflows/<name>.js`.
const INVOCATION_PATTERN = /_workflows\/([A-Za-z0-9_]+\.js)/g;

// The README inventory section, and the leading cell of each of its table rows.
const INVENTORY_SECTION_PATTERN = /^### Workflow scripts\b.*?$(.*?)^### /ms;
const INVENTORY_ROW_PATTERN = /^\| `([A-Za-z0-9_]+\.js)` \|/gm;

function shippedWorkflows() {
  return fs.readdirSync(WORKFLOWS_DIR).filter(name => name.endsWith('.js'));
}

function invokedWorkflows() {
  const invoked = new Set();
  for (const skillPath of findFiles(SKILLS_DIR, file => path.basename(file) === 'SKILL.md')) {
    const markdown = fs.readFileSync(skillPath, 'utf8');
    for (const [, script] of markdown.matchAll(INVOCATION_PATTERN)) invoked.add(script);
  }
  return invoked;
}

function documentedWorkflows() {
  const readme = fs.readFileSync(README_PATH, 'utf8');
  const section = readme.match(INVENTORY_SECTION_PATTERN);
  assert.ok(section, 'README.md has no "### Workflow scripts" inventory section');

  return [...section[1].matchAll(INVENTORY_ROW_PATTERN)].map(([, script]) => script);
}

test('every workflow a SKILL.md invokes ships at lib/workflows/', () => {
  const shipped = new Set(shippedWorkflows());
  const orphaned = [...invokedWorkflows()].filter(script => !shipped.has(script));

  assert.deepEqual(orphaned, [], `SKILL.md invokes workflows that do not exist: ${orphaned.join(', ')}`);
});

test('every workflow shipped at lib/workflows/ is invoked by a SKILL.md', () => {
  const invoked = invokedWorkflows();
  const unreferenced = shippedWorkflows().filter(script => !invoked.has(script));

  assert.deepEqual(unreferenced, [], `workflows no SKILL.md invokes: ${unreferenced.join(', ')}`);
});

test('the README workflow inventory lists exactly the workflows shipped at lib/workflows/', () => {
  assert.deepEqual(documentedWorkflows().sort(), shippedWorkflows().sort());
});
