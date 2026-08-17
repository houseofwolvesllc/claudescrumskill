import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  classifyIsolationStrategy,
  detectIsolationStrategy,
  dependenciesAreTracked,
  WORKTREE,
  SERIAL_IN_TREE,
} from './detect_repo_layout.mjs'
import { CLONE, INSTALL } from './resolve_dependency_strategy.mjs'

// What the gate is handed in a repo a fresh worktree can be provisioned in —
// the list resolve_dependency_strategy answers with, imported rather than
// spelled out so the seam the pipeline composes is the seam under test.
const CAN_BE_PROVISIONED = [CLONE, INSTALL]
const NOTHING_VIABLE = []

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

function commitRepoWithUntrackedDependencies(dir) {
  initRepo(dir)
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n')
  mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true })
  writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n')
  writeFileSync(path.join(dir, 'app.js'), 'console.log(1)\n')
  execGit(['-C', dir, 'add', '.'])
  execGit(['-C', dir, 'commit', '-q', '-m', 'init'])
}

// ---- pure classifier ----

test('classifyIsolationStrategy: tracked deps → worktree; the worktree is materialized with them', () => {
  assert.equal(classifyIsolationStrategy('node_modules/left-pad/index.js\n', false), WORKTREE)
})

test('classifyIsolationStrategy: untracked deps a viable strategy can provision → worktree', () => {
  assert.equal(classifyIsolationStrategy('', false, CAN_BE_PROVISIONED), WORKTREE)
  assert.equal(classifyIsolationStrategy('   \n', false, CAN_BE_PROVISIONED), WORKTREE)
})

test('classifyIsolationStrategy: untracked deps nothing can provision → serial-in-tree', () => {
  assert.equal(classifyIsolationStrategy('', false, NOTHING_VIABLE), SERIAL_IN_TREE)
  assert.equal(classifyIsolationStrategy('   \n', false), SERIAL_IN_TREE)
})

test('classifyIsolationStrategy: command error → serial-in-tree however much is viable', () => {
  assert.equal(classifyIsolationStrategy('anything', true, CAN_BE_PROVISIONED), SERIAL_IN_TREE)
})

test('dependenciesAreTracked: reads the paths git printed, since git prints nothing and exits 0', () => {
  assert.equal(dependenciesAreTracked('node_modules/left-pad/index.js\n'), true)
  assert.equal(dependenciesAreTracked('   \n'), false)
  assert.equal(dependenciesAreTracked(), false)
})

// ---- detectIsolationStrategy against real temp repos ----

test('detectIsolationStrategy: untracked node_modules a strategy can provision → worktree', () => {
  const dir = freshDir()
  try {
    commitRepoWithUntrackedDependencies(dir)

    assert.equal(detectIsolationStrategy(dir, execGit, CAN_BE_PROVISIONED), WORKTREE)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detectIsolationStrategy: untracked node_modules nothing can provision → serial-in-tree', () => {
  const dir = freshDir()
  try {
    commitRepoWithUntrackedDependencies(dir)

    assert.equal(detectIsolationStrategy(dir, execGit, NOTHING_VIABLE), SERIAL_IN_TREE)
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
    assert.equal(detectIsolationStrategy(dir, execGit, CAN_BE_PROVISIONED), SERIAL_IN_TREE)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detectIsolationStrategy: an execGit that throws is contained, not propagated', () => {
  const throwingExecGit = () => {
    throw new Error('git not found')
  }
  assert.equal(detectIsolationStrategy('/nowhere', throwingExecGit, CAN_BE_PROVISIONED), SERIAL_IN_TREE)
})
