import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  classifyIsolationStrategy,
  detectIsolationStrategy,
  WORKTREE,
  SERIAL_IN_TREE,
} from './detect_repo_layout.mjs'

function execGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function freshDir() {
  return mkdtempSync(path.join(tmpdir(), 'detect-layout-'))
}

function initRepo(dir) {
  execGit(['-C', dir, 'init', '-q'])
  execGit(['-C', dir, 'config', 'user.email', 'test@example.com'])
  execGit(['-C', dir, 'config', 'user.name', 'Test'])
}

// ---- pure classifier ----

test('classifyIsolationStrategy: non-empty stdout → worktree (tracked deps)', () => {
  assert.equal(classifyIsolationStrategy('node_modules/left-pad/index.js\n', false), WORKTREE)
})

test('classifyIsolationStrategy: empty stdout → serial-in-tree (untracked deps)', () => {
  assert.equal(classifyIsolationStrategy('', false), SERIAL_IN_TREE)
  assert.equal(classifyIsolationStrategy('   \n', false), SERIAL_IN_TREE)
})

test('classifyIsolationStrategy: command error → serial-in-tree regardless of stdout', () => {
  assert.equal(classifyIsolationStrategy('anything', true), SERIAL_IN_TREE)
})

// ---- detectIsolationStrategy against real temp repos ----

test('detectIsolationStrategy: untracked node_modules → serial-in-tree', () => {
  const dir = freshDir()
  try {
    initRepo(dir)
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
    mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
    writeFileSync(path.join(dir, 'app.js'), 'console.log(1)\n')
    execGit(['-C', dir, 'add', '.'])
    execGit(['-C', dir, 'commit', '-q', '-m', 'init'])

    assert.equal(detectIsolationStrategy(dir, execGit), SERIAL_IN_TREE)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detectIsolationStrategy: tracked/vendored node_modules → worktree', () => {
  const dir = freshDir()
  try {
    initRepo(dir)
    // No gitignore: node_modules is committed (vendored).
    mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
    execGit(['-C', dir, 'add', '.'])
    execGit(['-C', dir, 'commit', '-q', '-m', 'vendor deps'])

    assert.equal(detectIsolationStrategy(dir, execGit), WORKTREE)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detectIsolationStrategy: non-git directory → serial-in-tree (never throws)', () => {
  const dir = freshDir()
  try {
    assert.equal(detectIsolationStrategy(dir, execGit), SERIAL_IN_TREE)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detectIsolationStrategy: an execGit that throws is contained, not propagated', () => {
  const throwingExecGit = () => {
    throw new Error('git not found')
  }
  assert.equal(detectIsolationStrategy('/nowhere', throwingExecGit), SERIAL_IN_TREE)
})
