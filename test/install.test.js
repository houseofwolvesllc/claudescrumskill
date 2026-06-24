const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { deepMerge, installConfig } = require('../bin/install.js');

const DEFAULT_CONFIG = {
  scaffolding: 'local',
  paths: {
    specs: '.claude-scrum-skill/specs',
    adr: '.claude-scrum-skill/adr',
    backlog: '.claude-scrum-skill/backlog',
    context: '.claude-scrum-skill/context'
  },
  scaffold: { two_pass_threshold_words: 5000, design_spike_enabled: true },
  jira: { project_key: '' },
  trello: { board_id: '' }
};

function freshTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
}

function writeDefault(dir) {
  const defaultPath = path.join(dir, 'default.json');
  fs.writeFileSync(defaultPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  return defaultPath;
}

test('deepMerge adds a new top-level default key absent from user config', () => {
  const merged = deepMerge({ scaffolding: 'local', newKey: 'fromDefault' }, { scaffolding: 'local' });
  assert.equal(merged.newKey, 'fromDefault');
});

test('deepMerge lets a user scalar win over the default scalar', () => {
  const merged = deepMerge({ scaffolding: 'local' }, { scaffolding: 'global' });
  assert.equal(merged.scaffolding, 'global');
});

test('deepMerge recurses: user paths.specs survives while a new default paths key is added', () => {
  const defaults = { paths: { specs: '.scrum/specs', adr: '.scrum/adr' } };
  const overrides = { paths: { specs: 'docs/specs' } };

  const merged = deepMerge(defaults, overrides);

  assert.equal(merged.paths.specs, 'docs/specs');
  assert.equal(merged.paths.adr, '.scrum/adr');
});

test('deepMerge preserves an orphan key present only in the user config', () => {
  const merged = deepMerge({ scaffolding: 'local' }, { scaffolding: 'local', customField: 'keep me' });
  assert.equal(merged.customField, 'keep me');
});

test('deepMerge treats arrays as leaves: the user array wins wholesale with no concatenation', () => {
  const merged = deepMerge({ tags: ['a', 'b'] }, { tags: ['x'] });
  assert.deepEqual(merged.tags, ['x']);
});

test('deepMerge mutates neither input', () => {
  const defaults = { paths: { specs: '.scrum/specs' } };
  const overrides = { paths: { specs: 'docs/specs' } };
  const defaultsSnapshot = structuredClone(defaults);
  const overridesSnapshot = structuredClone(overrides);

  deepMerge(defaults, overrides);

  assert.deepEqual(defaults, defaultsSnapshot);
  assert.deepEqual(overrides, overridesSnapshot);
});

test('deepMerge is idempotent: merging an already-merged result equals the first merge', () => {
  const defaults = { paths: { specs: '.scrum/specs', adr: '.scrum/adr' }, scaffolding: 'local' };
  const user = { paths: { specs: 'docs/specs' }, jira: { project_key: 'ABC' } };

  const once = deepMerge(defaults, user);
  const twice = deepMerge(defaults, once);

  assert.deepEqual(twice, once);
});

test('installConfig on a fresh dest writes the default verbatim and reports action default', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');

  const result = installConfig(defaultPath, destPath);

  assert.equal(result.action, 'default');
  assert.deepEqual(JSON.parse(fs.readFileSync(destPath, 'utf8')), DEFAULT_CONFIG);
});

test('installConfig on upgrade retains a customized paths.specs and a non-empty jira.project_key', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');
  const userConfig = structuredClone(DEFAULT_CONFIG);
  userConfig.paths.specs = 'docs/specs';
  userConfig.jira.project_key = 'SCRUM';
  fs.writeFileSync(destPath, `${JSON.stringify(userConfig, null, 2)}\n`);

  const result = installConfig(defaultPath, destPath);

  const written = JSON.parse(fs.readFileSync(destPath, 'utf8'));
  assert.equal(result.action, 'merged');
  assert.equal(written.paths.specs, 'docs/specs');
  assert.equal(written.jira.project_key, 'SCRUM');
});

test('installConfig on upgrade introduces a default key the user file lacked', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');
  fs.writeFileSync(destPath, `${JSON.stringify({ scaffolding: 'local' }, null, 2)}\n`);

  installConfig(defaultPath, destPath);

  const written = JSON.parse(fs.readFileSync(destPath, 'utf8'));
  assert.deepEqual(written.paths, DEFAULT_CONFIG.paths);
});

test('installConfig on malformed config backs up the original bytes and writes the default', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');
  const malformed = '{ not json';
  fs.writeFileSync(destPath, malformed);

  const result = installConfig(defaultPath, destPath);

  assert.equal(result.action, 'recovered');
  assert.equal(fs.readFileSync(`${destPath}.bak`, 'utf8'), malformed);
  assert.deepEqual(JSON.parse(fs.readFileSync(destPath, 'utf8')), DEFAULT_CONFIG);
});

test('installConfig writes 2-space-indented JSON with a trailing newline', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');

  installConfig(defaultPath, destPath);

  const written = fs.readFileSync(destPath, 'utf8');
  assert.equal(written, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  assert.ok(written.endsWith('\n'));
  assert.match(written, /\n {2}"paths"/);
});

test('installConfig is idempotent: a second run yields a byte-identical file', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');
  const userConfig = structuredClone(DEFAULT_CONFIG);
  userConfig.paths.specs = 'docs/specs';
  fs.writeFileSync(destPath, `${JSON.stringify(userConfig, null, 2)}\n`);

  installConfig(defaultPath, destPath);
  const first = fs.readFileSync(destPath, 'utf8');
  installConfig(defaultPath, destPath);
  const second = fs.readFileSync(destPath, 'utf8');

  assert.equal(second, first);
});
