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

// ---- refusals ----

const withoutCopyOnWrite = { mainTreePath: MAIN_TREE, copyOnWriteSupported: false }

test('clone on a filesystem without copy-on-write support resolves to install instead', () => {
  const { strategy, instruction } = resolveDependencyStrategy(CLONE, withoutCopyOnWrite)

  assert.equal(strategy, INSTALL)
  assert.equal(instruction, resolveDependencyStrategy(INSTALL).instruction)
})

test('the substitution for an unsupported clone is logged, naming both strategies', () => {
  const { outcome } = resolveDependencyStrategy(CLONE, withoutCopyOnWrite)

  assert.match(outcome, /Dependency strategy: install\b/)
  assert.match(outcome, /clone.*copy-on-write/s)
})

test('a clone that cannot run falls back to the clean install, never to a real copy', () => {
  const { instruction } = resolveDependencyStrategy(CLONE, { mainTreePath: MAIN_TREE })

  assert.match(instruction, /clean-install command/)
  assert.doesNotMatch(instruction, /cp -R/)
  assert.doesNotMatch(resolveDependencyStrategy(CLONE, withoutCopyOnWrite).instruction, /cp -R/)
})

const storyTouching = surface => ({ slug: 'add-a-dependency', technical_context: surface })

test('symlink refuses a batch whose story touches package.json, naming that story', () => {
  const stories = [{ slug: 'unrelated-story' }, storyTouching('Adds the parser to package.json.')]

  assert.throws(
    () => resolveDependencyStrategy(SYMLINK, { mainTreePath: MAIN_TREE, stories }),
    /symlink.*add-a-dependency/s,
  )
})

test('symlink refuses a batch whose story touches a lockfile', () => {
  const stories = [{ slug: 'add-a-dependency', acceptance_criteria: ['The lockfile is updated in the same commit'] }]

  assert.throws(() => resolveDependencyStrategy(SYMLINK, { mainTreePath: MAIN_TREE, stories }), /add-a-dependency/)
})

test('symlink refuses rather than downgrading to a safer strategy', () => {
  const stories = [storyTouching('Bumps the pinned version in package.json.')]
  let resolved = 'nothing resolved'

  try {
    resolved = resolveDependencyStrategy(SYMLINK, { mainTreePath: MAIN_TREE, stories }).strategy
  } catch {
    // The refusal is the behaviour under test; the assertion below is that no
    // strategy was resolved in its place.
  }

  assert.equal(resolved, 'nothing resolved')
})

test('symlink links a batch whose stories touch no dependency file', () => {
  const stories = [{ slug: 'rename-a-field', technical_context: 'Renames one column and its mapper.' }]

  assert.equal(resolveDependencyStrategy(SYMLINK, { mainTreePath: MAIN_TREE, stories }).strategy, SYMLINK)
})
