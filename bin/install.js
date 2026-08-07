#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const HOME = process.env.HOME || process.env.USERPROFILE;
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(PACKAGE_ROOT, 'skills');
const WORKFLOWS_SOURCE_DIR = path.join(PACKAGE_ROOT, 'lib', 'workflows');
const GUIDANCE_SOURCE_DIR = path.join(PACKAGE_ROOT, 'lib', 'guidance');
const SOURCE_CHECKOUT_MARKERS = ['bin', 'skills'];
const CONFIG_FILENAME = 'config.json';

const skills = [
  'project-scaffold',
  'project-spec',
  'sprint-plan',
  'sprint-status',
  'sprint-release',
  'project-emulate',
  'project-orchestrate',
  'project-cleanup'
];

async function main() {
  const skillsDir = resolveSkillsDir();
  const location = isGlobalInstall() ? 'global (~/.claude/skills/)' : `project (${skillsDir})`;
  console.log(`\n📋 Installing claude-scrum-skill (${location})...\n`);

  fs.mkdirSync(skillsDir, { recursive: true });

  installSharedReferences(skillsDir);
  const installed = installSkills(skillsDir);
  installWorkflows(skillsDir);
  installGuidance(skillsDir);
  await verifyWorkflowInstall(skillsDir);

  if (!isGlobalInstall()) {
    ensureGitignoreEntry(skillsDir);
  }

  console.log(`\n✨ Installed ${installed} skills to ${skillsDir}`);
  console.log('   Restart Claude Code for the skills to become available.\n');
  console.log('   Run /project-scaffold <prd-path> to get started.\n');
}

// npm exports npm_config_global for `npm install -g`. Read at call time so the
// resolver reflects the invocation rather than module-load order.
function isGlobalInstall() {
  return process.env.npm_config_global === 'true';
}

function resolveSkillsDir() {
  if (isGlobalInstall()) {
    return path.join(HOME, '.claude', 'skills');
  }
  return path.join(resolveProjectRoot(PACKAGE_ROOT), '.claude', 'skills');
}

// The project the skills belong to, guarded so an install can never escape to
// the filesystem root and write outside any project.
function resolveProjectRoot(packageRoot) {
  const projectRoot = findProjectRoot(packageRoot);
  if (isFilesystemRoot(projectRoot)) {
    throw new Error(`refusing to install to the filesystem root (resolved from ${packageRoot})`);
  }
  return projectRoot;
}

// Installed as a dependency, the project is the first ancestor above
// node_modules; run from a source checkout — the development case, where no
// node_modules ancestor exists — it is the checkout itself.
function findProjectRoot(packageRoot) {
  for (let dir = packageRoot; !isFilesystemRoot(dir); dir = path.dirname(dir)) {
    if (path.basename(dir) === 'node_modules') return path.dirname(dir);
  }
  return requireSourceCheckout(packageRoot);
}

// Structural signature of a checkout: the package's own bin/ and skills/ sit at
// its root. Anything else is an unrecognized layout we must not guess about.
function requireSourceCheckout(packageRoot) {
  const isCheckout = SOURCE_CHECKOUT_MARKERS.every(marker =>
    fs.existsSync(path.join(packageRoot, marker))
  );
  if (!isCheckout) {
    throw new Error(
      `cannot resolve an install target: ${packageRoot} is neither under node_modules ` +
        `nor a source checkout (expected ${SOURCE_CHECKOUT_MARKERS.join('/ and ')}/)`
    );
  }
  return packageRoot;
}

function isFilesystemRoot(dir) {
  return path.dirname(dir) === dir;
}

function installSharedReferences(skillsDir) {
  const sharedSrc = path.join(SOURCE_DIR, 'shared');
  const sharedDest = path.join(skillsDir, 'shared');
  if (!fs.existsSync(sharedSrc)) return;

  // config.json is user-owned: copy everything else, then merge it explicitly.
  const skipConfig = path.resolve(sharedSrc, CONFIG_FILENAME);
  copyRecursive(sharedSrc, sharedDest, srcPath => path.resolve(srcPath) === skipConfig);
  console.log('  📁 shared references');

  installSharedConfig(sharedSrc, sharedDest);
}

function installSharedConfig(sharedSrc, sharedDest) {
  const defaultPath = path.join(sharedSrc, CONFIG_FILENAME);
  const destPath = path.join(sharedDest, CONFIG_FILENAME);

  try {
    const { action } = installConfig(defaultPath, destPath);
    console.log(configLogLine(action));
  } catch (error) {
    console.log(`  ⚠️  config install failed (${error.message}) — skills still installed`);
  }
}

function configLogLine(action) {
  switch (action) {
    case 'default':
      return '  📁 config (default)';
    case 'merged':
      return '  🔧 config (merged — your settings preserved)';
    case 'recovered':
      return `  ⚠️  config was invalid JSON — backed up to ${CONFIG_FILENAME}.bak, wrote default`;
    default:
      throw new Error(`unknown config action: ${action}`);
  }
}

function installSkills(skillsDir) {
  let installed = 0;
  for (const skill of skills) {
    const src = path.join(SOURCE_DIR, skill);
    const dest = path.join(skillsDir, skill);

    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log(`  ✅ ${skill}`);
      installed++;
    } else {
      console.log(`  ⚠️  ${skill} — source not found, skipping`);
    }
  }
  return installed;
}

// Copy lib/workflows/ → <skillsDir>/_workflows/ (v2.0.0+).
// Underscore prefix prevents Claude Code from registering it as a skill.
function installWorkflows(skillsDir) {
  if (!fs.existsSync(WORKFLOWS_SOURCE_DIR)) return;
  const workflowsDest = path.join(skillsDir, '_workflows');
  // Shared modules colocate their *.test.mjs (house style). The canonical
  // modules ship (they are the DRY source inlined into the scripts and the
  // smoke check imports them), but the colocated tests must not ship.
  copyRecursive(WORKFLOWS_SOURCE_DIR, workflowsDest, isTestFile);
  console.log('  ⚙️  _workflows (lib/workflows + schemas)');
}

// Skip predicate: colocated test files (*.test.*) are never part of a payload.
function isTestFile(srcPath) {
  return /\.test\./.test(path.basename(srcPath));
}

// Copy lib/guidance/ → <skillsDir>/_guidance/ (v2.1.3+).
// Underscore prefix keeps these internal — orchestrator-injected situational
// guidance for core epics, never registered as user-facing skills.
function installGuidance(skillsDir) {
  if (!fs.existsSync(GUIDANCE_SOURCE_DIR)) return;
  const guidanceDest = path.join(skillsDir, '_guidance');
  copyRecursive(GUIDANCE_SOURCE_DIR, guidanceDest);
  console.log('  🧭 _guidance (design-patterns + domain-modeling)');
}

function ensureGitignoreEntry(skillsDir) {
  const projectRoot = path.resolve(skillsDir, '..', '..');
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entry = '.claude-scrum-skill';

  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  if (existing.split('\n').some(line => line.trim() === entry)) return;

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(gitignorePath, `${prefix}${entry}\n`);
  console.log(`\n  📝 Added ${entry} to .gitignore`);
}

// Recursively copy src → dest. `shouldSkip(absoluteSrcPath) => boolean` is an
// optional predicate consulted for every file and directory; a skipped
// directory prunes its whole subtree. (Generalized from the earlier single
// exact-path `skipPath`, so callers can skip by name pattern — e.g. *.test.*.)
function copyRecursive(src, dest, shouldSkip) {
  if (!fs.existsSync(src)) return;
  if (shouldSkip && shouldSkip(src)) return;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item), shouldSkip);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Post-install smoke check for the workflow payload (F11): the shared modules
// must be present and importable, and no colocated test file may have shipped.
// Throws on either failure so a broken payload surfaces at install time rather
// than at first workflow run.
async function verifyWorkflowInstall(skillsDir) {
  const workflowsDest = path.join(skillsDir, '_workflows');
  if (!fs.existsSync(workflowsDest)) return;

  const shippedTests = findFiles(workflowsDest, isTestFile);
  if (shippedTests.length > 0) {
    throw new Error(
      `workflow install shipped test files (they must be skipped): ${shippedTests.join(', ')}`
    );
  }

  const sharedDir = path.join(workflowsDest, '_shared');
  if (!fs.existsSync(sharedDir)) {
    throw new Error('_workflows/_shared is missing after install');
  }
  const modules = fs
    .readdirSync(sharedDir)
    .filter(name => name.endsWith('.mjs') && !isTestFile(name));
  if (modules.length === 0) {
    throw new Error('_workflows/_shared shipped no .mjs modules');
  }
  for (const name of modules) {
    await import(pathToFileURL(path.join(sharedDir, name)).href);
  }
  console.log(
    `  🔎 workflow smoke check: ${modules.length} shared module(s) present & importable, no tests shipped`
  );
}

// Absolute paths of every file under root for which match(absPath) is true.
function findFiles(root, match) {
  const out = [];
  const walk = current => {
    for (const item of fs.readdirSync(current)) {
      const full = path.join(current, item);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (match(full)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Pure deep-merge: returns a new object. Recurses plain objects; arrays and
// scalars are leaves with the override winning. Orphan override keys survive.
function deepMerge(defaults, overrides) {
  const merged = { ...defaults };

  for (const key of Object.keys(overrides)) {
    const defaultValue = defaults[key];
    const overrideValue = overrides[key];

    if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
      merged[key] = deepMerge(defaultValue, overrideValue);
    } else {
      merged[key] = overrideValue;
    }
  }

  return merged;
}

function serializeConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

// Three-branch config installer. Returns { action }:
//   'default'   — dest absent, default copied verbatim.
//   'merged'    — dest valid JSON, deep-merged with user values winning.
//   'recovered' — dest invalid JSON, backed up to .bak, default written.
function installConfig(defaultPath, destPath) {
  const defaults = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));

  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, serializeConfig(defaults));
    return { action: 'default' };
  }

  const rawDest = fs.readFileSync(destPath, 'utf8');
  const userConfig = parseConfig(rawDest);

  if (userConfig === undefined) {
    fs.copyFileSync(destPath, `${destPath}.bak`);
    fs.writeFileSync(destPath, serializeConfig(defaults));
    return { action: 'recovered' };
  }

  fs.writeFileSync(destPath, serializeConfig(deepMerge(defaults, userConfig)));
  return { action: 'merged' };
}

function parseConfig(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`\n❌ install failed: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  resolveSkillsDir,
  resolveProjectRoot,
  deepMerge,
  installConfig,
  installSkills,
  installGuidance,
  installWorkflows,
  copyRecursive,
  isTestFile,
  findFiles,
  verifyWorkflowInstall,
};
