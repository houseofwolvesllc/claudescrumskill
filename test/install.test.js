const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deepMerge,
  installConfig,
  installSkills,
  installGuidance,
  installWorkflows,
  copyRecursive,
  isTestFile,
  findFiles,
  verifyWorkflowInstall,
  resolveSkillsDir,
  resolveProjectRoot,
} = require('../bin/install.js');

const DEFAULT_CONFIG = {
  scaffolding: 'local',
  paths: {
    specs: '.claude-scrum-skill/specs',
    adr: '.claude-scrum-skill/adr',
    backlog: '.claude-scrum-skill/backlog',
    context: '.claude-scrum-skill/context'
  },
  scaffold: { two_pass_threshold_words: 5000, design_spike_enabled: true },
  telemetry: { report: true },
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

test('deepMerge lets a user scalar replace a default object wholesale', () => {
  const merged = deepMerge({ scaffold: { design_spike_enabled: true } }, { scaffold: 'off' });
  assert.equal(merged.scaffold, 'off');
});

test('deepMerge lets a user object replace a default scalar wholesale', () => {
  const merged = deepMerge({ scaffold: 'off' }, { scaffold: { design_spike_enabled: true } });
  assert.deepEqual(merged.scaffold, { design_spike_enabled: true });
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

test('installConfig on upgrade keeps a user telemetry.report of false against the true default', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');
  const userConfig = structuredClone(DEFAULT_CONFIG);
  userConfig.telemetry.report = false;
  fs.writeFileSync(destPath, `${JSON.stringify(userConfig, null, 2)}\n`);

  const result = installConfig(defaultPath, destPath);

  const written = JSON.parse(fs.readFileSync(destPath, 'utf8'));
  assert.equal(result.action, 'merged');
  assert.equal(written.telemetry.report, false);
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

test('installConfig recovers a malformed config, then merges on the next run with the backup intact', () => {
  const dir = freshTempDir();
  const defaultPath = writeDefault(dir);
  const destPath = path.join(dir, 'config.json');
  const malformed = '{ not json';
  fs.writeFileSync(destPath, malformed);

  const recovered = installConfig(defaultPath, destPath);
  const reRun = installConfig(defaultPath, destPath);

  assert.equal(recovered.action, 'recovered');
  assert.equal(reRun.action, 'merged');
  assert.equal(fs.readFileSync(`${destPath}.bak`, 'utf8'), malformed);
  assert.deepEqual(JSON.parse(fs.readFileSync(destPath, 'utf8')), DEFAULT_CONFIG);
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

function installInto(skillsDir) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    installSkills(skillsDir);
    installGuidance(skillsDir);
  } finally {
    console.log = originalLog;
  }
}

test('install ships the guidance skills under the non-registered _guidance/ directory', () => {
  const skillsDir = freshTempDir();

  installInto(skillsDir);

  assert.ok(fs.existsSync(path.join(skillsDir, '_guidance', 'design-patterns', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(skillsDir, '_guidance', 'domain-modeling', 'SKILL.md')));
});

test('install keeps design-patterns and domain-modeling out of the user-facing skill registry', () => {
  const skillsDir = freshTempDir();

  installInto(skillsDir);

  assert.ok(!fs.existsSync(path.join(skillsDir, 'design-patterns')));
  assert.ok(!fs.existsSync(path.join(skillsDir, 'domain-modeling')));
});

test('isTestFile matches *.test.* files and spares production modules', () => {
  assert.ok(isTestFile('/x/normalize_args.test.mjs'));
  assert.ok(isTestFile('/x/install.test.js'));
  assert.ok(!isTestFile('/x/normalize_args.mjs'));
  assert.ok(!isTestFile('/x/sprint_pipeline.js'));
});

test('copyRecursive skip predicate prunes matched files but copies the rest', () => {
  const src = freshTempDir();
  const dest = freshTempDir();
  fs.writeFileSync(path.join(src, 'keep.mjs'), 'export const a = 1\n');
  fs.writeFileSync(path.join(src, 'drop.test.mjs'), 'test skeleton\n');

  copyRecursive(src, dest, isTestFile);

  assert.ok(fs.existsSync(path.join(dest, 'keep.mjs')));
  assert.ok(!fs.existsSync(path.join(dest, 'drop.test.mjs')));
});

test('installWorkflows ships _shared/*.mjs but no colocated *.test.* files', () => {
  const skillsDir = freshTempDir();
  const originalLog = console.log;
  console.log = () => {};
  try {
    installWorkflows(skillsDir);
  } finally {
    console.log = originalLog;
  }

  const sharedDir = path.join(skillsDir, '_workflows', '_shared');
  assert.ok(fs.existsSync(path.join(sharedDir, 'normalize_args.mjs')));
  assert.equal(findFiles(path.join(skillsDir, '_workflows'), isTestFile).length, 0);
});

test('verifyWorkflowInstall passes on a real install: modules importable, no tests shipped', async () => {
  const skillsDir = freshTempDir();
  const originalLog = console.log;
  console.log = () => {};
  try {
    installWorkflows(skillsDir);
    await verifyWorkflowInstall(skillsDir);
  } finally {
    console.log = originalLog;
  }
});

test('verifyWorkflowInstall throws when a test file leaks into the payload', async () => {
  const skillsDir = freshTempDir();
  const originalLog = console.log;
  console.log = () => {};
  try {
    installWorkflows(skillsDir);
  } finally {
    console.log = originalLog;
  }
  // Simulate a leaked colocated test in the installed payload.
  fs.writeFileSync(path.join(skillsDir, '_workflows', '_shared', 'leaked.test.mjs'), '// leak\n');

  await assert.rejects(() => verifyWorkflowInstall(skillsDir), /shipped test files/);
});

const REPO_ROOT = path.resolve(__dirname, '..');

// The structural signature the resolver looks for: bin/ and skills/ at the root.
function makeSourceCheckout(parent) {
  const checkout = path.join(parent, 'claude-scrum-skill');
  fs.mkdirSync(path.join(checkout, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(checkout, 'skills'), { recursive: true });
  return checkout;
}

// npm sets npm_config_global for `npm i -g`; the resolver reads it at call time.
function withNpmConfigGlobal(value, run) {
  const original = process.env.npm_config_global;
  process.env.npm_config_global = value;
  try {
    return run();
  } finally {
    if (original === undefined) delete process.env.npm_config_global;
    else process.env.npm_config_global = original;
  }
}

test('resolveSkillsDir from a source checkout targets the checkout root, not the filesystem root', () => {
  const skillsDir = withNpmConfigGlobal('false', () => resolveSkillsDir());

  assert.equal(skillsDir, path.join(REPO_ROOT, '.claude', 'skills'));
});

test('resolveProjectRoot returns the checkout itself when no node_modules ancestor exists', () => {
  const checkout = makeSourceCheckout(freshTempDir());

  assert.equal(resolveProjectRoot(checkout), checkout);
});

test('resolveProjectRoot returns the consuming project root when installed under node_modules', () => {
  const consumer = freshTempDir();
  const installed = path.join(consumer, 'node_modules', '@houseofwolvesllc', 'claude-scrum-skill');
  fs.mkdirSync(path.join(installed, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(installed, 'skills'), { recursive: true });

  assert.equal(resolveProjectRoot(installed), consumer);
});

test('resolveSkillsDir under npm_config_global=true targets the home skills directory', () => {
  const skillsDir = withNpmConfigGlobal('true', () => resolveSkillsDir());

  const home = process.env.HOME || process.env.USERPROFILE;
  assert.equal(skillsDir, path.join(home, '.claude', 'skills'));
});

test('resolveProjectRoot refuses a node_modules sitting at the filesystem root', () => {
  const rootInstall = path.join(path.parse(REPO_ROOT).root, 'node_modules', 'claude-scrum-skill');

  assert.throws(() => resolveProjectRoot(rootInstall), /filesystem root/);
});

test('resolveProjectRoot refuses the filesystem root itself', () => {
  assert.throws(() => resolveProjectRoot(path.parse(REPO_ROOT).root));
});

test('resolveProjectRoot refuses a directory that is neither a checkout nor under node_modules', () => {
  const stray = freshTempDir();

  assert.throws(() => resolveProjectRoot(stray), /source checkout/);
});
