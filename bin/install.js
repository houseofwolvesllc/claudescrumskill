#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const SOURCE_DIR = path.join(__dirname, '..', 'skills');
const WORKFLOWS_SOURCE_DIR = path.join(__dirname, '..', 'lib', 'workflows');
const GUIDANCE_SOURCE_DIR = path.join(__dirname, '..', 'lib', 'guidance');
const IS_GLOBAL = process.env.npm_config_global === 'true';
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

function main() {
  const skillsDir = resolveSkillsDir();
  const location = IS_GLOBAL ? 'global (~/.claude/skills/)' : `project (${skillsDir})`;
  console.log(`\n📋 Installing claude-scrum-skill (${location})...\n`);

  fs.mkdirSync(skillsDir, { recursive: true });

  installSharedReferences(skillsDir);
  const installed = installSkills(skillsDir);
  installWorkflows(skillsDir);
  installGuidance(skillsDir);

  if (!IS_GLOBAL) {
    ensureGitignoreEntry(skillsDir);
  }

  console.log(`\n✨ Installed ${installed} skills to ${skillsDir}`);
  console.log('   Restart Claude Code for the skills to become available.\n');
  console.log('   Run /project-scaffold <prd-path> to get started.\n');
}

function resolveSkillsDir() {
  if (IS_GLOBAL) {
    return path.join(HOME, '.claude', 'skills');
  }

  // Walk up from node_modules to find the project root.
  let projectRoot = path.resolve(__dirname, '..');
  while (projectRoot !== path.dirname(projectRoot)) {
    if (path.basename(projectRoot) === 'node_modules') {
      projectRoot = path.dirname(projectRoot);
      break;
    }
    projectRoot = path.dirname(projectRoot);
  }
  return path.join(projectRoot, '.claude', 'skills');
}

function installSharedReferences(skillsDir) {
  const sharedSrc = path.join(SOURCE_DIR, 'shared');
  const sharedDest = path.join(skillsDir, 'shared');
  if (!fs.existsSync(sharedSrc)) return;

  // config.json is user-owned: copy everything else, then merge it explicitly.
  const skipConfig = path.join(sharedSrc, CONFIG_FILENAME);
  copyRecursive(sharedSrc, sharedDest, skipConfig);
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
  copyRecursive(WORKFLOWS_SOURCE_DIR, workflowsDest);
  console.log('  ⚙️  _workflows (lib/workflows + schemas)');
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

function copyRecursive(src, dest, skipPath) {
  if (!fs.existsSync(src)) return;
  if (skipPath && path.resolve(src) === path.resolve(skipPath)) return;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item), skipPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
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
  main();
}

module.exports = { deepMerge, installConfig, installSkills, installGuidance };
