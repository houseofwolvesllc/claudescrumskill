import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDependencyStrategy,
  DEPENDENCY_STRATEGIES,
  ASSUME_PRESENT,
  CLONE,
  INSTALL,
  SYMLINK,
} from './resolve_dependency_strategy.mjs'

const MAIN_TREE = '/repo'

// ---- resolution ----

test('an absent strategy resolves to assume-present', () => {
  assert.equal(resolveDependencyStrategy().strategy, ASSUME_PRESENT)
})

test('assume-present provisions nothing, so it issues no instruction', () => {
  assert.equal(resolveDependencyStrategy(ASSUME_PRESENT, { mainTreePath: MAIN_TREE }).instruction, '')
})

test('clone instructs a copy-on-write clone of node_modules from the main tree', () => {
  const { instruction } = resolveDependencyStrategy(CLONE, { mainTreePath: MAIN_TREE })

  assert.match(instruction, /cp -c -R "\/repo\/node_modules" node_modules/)
})

test('install instructs the project’s clean-install command and never names the main tree', () => {
  const { instruction } = resolveDependencyStrategy(INSTALL, { mainTreePath: MAIN_TREE })

  assert.match(instruction, /clean-install command/)
  assert.doesNotMatch(instruction, /\/repo/)
})

test('symlink instructs a link from the worktree’s node_modules to the main tree’s', () => {
  const { instruction } = resolveDependencyStrategy(SYMLINK, { mainTreePath: MAIN_TREE })

  assert.match(instruction, /ln -s "\/repo\/node_modules" node_modules/)
})

test('every strategy names itself in the outcome it is logged by', () => {
  for (const strategy of DEPENDENCY_STRATEGIES) {
    const { outcome } = resolveDependencyStrategy(strategy, { mainTreePath: MAIN_TREE })

    assert.match(outcome, new RegExp(`Dependency strategy: ${strategy}\\b`), `${strategy} outcome: ${outcome}`)
  }
})

// ---- preconditions ----

test('clone without the main tree path throws, naming what it cannot clone from', () => {
  assert.throws(() => resolveDependencyStrategy(CLONE), /clone.*main working tree/s)
})

test('symlink without the main tree path throws, naming what it cannot link to', () => {
  assert.throws(() => resolveDependencyStrategy(SYMLINK), /symlink.*main working tree/s)
})

test('install needs no main tree path — the clean install builds the tree from the lockfile', () => {
  assert.equal(resolveDependencyStrategy(INSTALL).strategy, INSTALL)
})

test('assume-present needs no main tree path', () => {
  assert.equal(resolveDependencyStrategy(ASSUME_PRESENT).strategy, ASSUME_PRESENT)
})

test('an unknown strategy throws, naming the four known strategies', () => {
  assert.throws(
    () => resolveDependencyStrategy('vendor', { mainTreePath: MAIN_TREE }),
    /unknown dependency strategy 'vendor'.*assume-present, clone, install, symlink/s,
  )
})
