#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const SKILLS_DIR = path.join(HOME, '.claude', 'skills');
const SOURCE_DIR = path.join(__dirname, '..', 'skills');

const skills = [
  'project-scaffold',
  'sprint-plan',
  'sprint-status',
  'sprint-release',
  'project-emulate'
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

console.log('\n📋 Installing claude-scrum-skill...\n');

// Ensure ~/.claude/skills exists
fs.mkdirSync(SKILLS_DIR, { recursive: true });

let installed = 0;
for (const skill of skills) {
  const src = path.join(SOURCE_DIR, skill);
  const dest = path.join(SKILLS_DIR, skill);

  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    console.log(`  ✅ ${skill}`);
    installed++;
  } else {
    console.log(`  ⚠️  ${skill} — source not found, skipping`);
  }
}

console.log(`\n✨ Installed ${installed} skills to ${SKILLS_DIR}`);
console.log('   Skills are available in Claude Code immediately.\n');
console.log('   Run /project-scaffold <prd-path> to get started.\n');
