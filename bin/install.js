#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const SOURCE_DIR = path.join(__dirname, '..', 'skills');
const IS_GLOBAL = process.env.npm_config_global === 'true';

// Global install → ~/.claude/skills/
// Local install  → <project>/.claude/skills/
let skillsDir;
if (IS_GLOBAL) {
  skillsDir = path.join(HOME, '.claude', 'skills');
} else {
  // Walk up from node_modules to find the project root
  let projectRoot = path.resolve(__dirname, '..');
  while (projectRoot !== path.dirname(projectRoot)) {
    if (path.basename(projectRoot) === 'node_modules') {
      projectRoot = path.dirname(projectRoot);
      break;
    }
    projectRoot = path.dirname(projectRoot);
  }
  skillsDir = path.join(projectRoot, '.claude', 'skills');
}

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

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

const location = IS_GLOBAL ? 'global (~/.claude/skills/)' : `project (${skillsDir})`;
console.log(`\n📋 Installing claude-scrum-skill (${location})...\n`);

fs.mkdirSync(skillsDir, { recursive: true });

// Copy shared references (not a skill, but needed by skills at ../shared/)
const sharedSrc = path.join(SOURCE_DIR, 'shared');
const sharedDest = path.join(skillsDir, 'shared');
if (fs.existsSync(sharedSrc)) {
  copyRecursive(sharedSrc, sharedDest);
  console.log('  📁 shared references');
}

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

// Add .claude-scrum-skill to .gitignore if not already present (local install only)
if (!IS_GLOBAL) {
  const projectRoot = path.resolve(skillsDir, '..', '..');
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const entry = '.claude-scrum-skill';

  let needsAppend = true;
  if (fs.existsSync(gitignorePath)) {
    const contents = fs.readFileSync(gitignorePath, 'utf8');
    needsAppend = !contents.split('\n').some(line => line.trim() === entry);
  }

  if (needsAppend) {
    const prefix = fs.existsSync(gitignorePath)
      && fs.readFileSync(gitignorePath, 'utf8').length > 0
      && !fs.readFileSync(gitignorePath, 'utf8').endsWith('\n')
      ? '\n' : '';
    fs.appendFileSync(gitignorePath, `${prefix}${entry}\n`);
    console.log(`\n  📝 Added ${entry} to .gitignore`);
  }
}

console.log(`\n✨ Installed ${installed} skills to ${skillsDir}`);
console.log('   Restart Claude Code for the skills to become available.\n');
console.log('   Run /project-scaffold <prd-path> to get started.\n');
