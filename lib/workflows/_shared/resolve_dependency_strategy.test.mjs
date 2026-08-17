import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveDependencyStrategy,
  escalateForStory,
  reconcileDependencyEscalation,
  detectPackageManager,
  viableProvisioningStrategies,
  DEPENDENCY_STRATEGIES,
  ASSUME_PRESENT,
  CLONE,
  INSTALL,
  SYMLINK,
  NPM,
  PNPM,
  YARN,
  BUN,
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

// ---- per-story escalation ----

const unrelatedStory = { slug: 'rename-a-field', technical_context: 'Renames one column and its mapper.' }
const cloneBatch = resolveDependencyStrategy(CLONE, { mainTreePath: MAIN_TREE })

test('a story whose declared surface names package.json escalates from clone to install', () => {
  const escalated = escalateForStory(cloneBatch, storyTouching('Adds the parser to package.json.'))

  assert.equal(escalated.strategy, INSTALL)
})

test('a story escalates on acceptance criteria as well as technical context', () => {
  const story = { slug: 'add-a-dependency', acceptance_criteria: ['The lockfile is updated in the same commit'] }

  assert.equal(escalateForStory(cloneBatch, story).strategy, INSTALL)
})

test('an escalated story is provisioned by the clean install, which a missing lockfile update fails', () => {
  const { instruction } = escalateForStory(cloneBatch, storyTouching('Adds the parser to package.json.'))

  assert.equal(instruction, resolveDependencyStrategy(INSTALL).instruction)
  assert.match(instruction, /lockfile does not match the manifest/)
})

test('the escalation is logged, naming the story and both strategies', () => {
  const { outcome } = escalateForStory(cloneBatch, storyTouching('Adds the parser to package.json.'))

  assert.match(outcome, /Dependency strategy: install\b/)
  assert.match(outcome, /add-a-dependency/)
  assert.match(outcome, /escalated from clone/)
})

test('a story that touches no dependency file keeps the batch strategy', () => {
  assert.deepEqual(escalateForStory(cloneBatch, unrelatedStory), cloneBatch)
})

test('assume-present does not escalate — a caller who asked for no provisioning gets none', () => {
  const batch = resolveDependencyStrategy(ASSUME_PRESENT)

  assert.deepEqual(escalateForStory(batch, storyTouching('Adds the parser to package.json.')), batch)
})

test('a story already running under install is left as it is', () => {
  const batch = resolveDependencyStrategy(INSTALL)

  assert.deepEqual(escalateForStory(batch, storyTouching('Adds the parser to package.json.')), batch)
})

// ---- post-hoc reconciliation ----

const reconcile = (strategy, changedFiles) =>
  reconcileDependencyEscalation({ story: unrelatedStory, strategy, changedFiles })

test('a story that changed a lockfile without having been escalated is reported', () => {
  const report = reconcile(CLONE, ['src/parser.js', 'package-lock.json'])

  assert.match(report, /rename-a-field/)
  assert.match(report, /package-lock\.json/)
  assert.match(report, /clone/)
})

test('the mismatch is reported, not corrected — reconciliation hands back a report, never a provisioning', () => {
  const report = reconcile(CLONE, ['package.json'])

  assert.equal(typeof report, 'string')
  assert.match(report, /not corrected/)
})

test('a story that ran under install is not reported, however many dependency files it changed', () => {
  assert.equal(reconcile(INSTALL, ['package.json', 'package-lock.json']), '')
})

test('a story that ran under assume-present is not reported — no directory was provisioned to validate', () => {
  assert.equal(reconcile(ASSUME_PRESENT, ['package.json', 'package-lock.json']), '')
})

test('a story that changed no dependency file is not reported', () => {
  assert.equal(reconcile(CLONE, ['src/parser.js', 'docs/package.json.md']), '')
})

test('a story with no reported diff is not reported', () => {
  assert.equal(reconcileDependencyEscalation({ story: unrelatedStory, strategy: CLONE }), '')
})

test('a dependency file nested under a workspace package is a dependency change', () => {
  assert.match(reconcile(CLONE, ['packages/api/package.json']), /packages\/api\/package\.json/)
})

test('a file whose name merely ends in a dependency file name is not a dependency change', () => {
  assert.equal(reconcile(CLONE, ['fixtures/my-package.json', 'src/lockfile_reader.js']), '')
})

test('a dependency change under symlink is reported too — the detection gap is the same one', () => {
  assert.match(reconcile(SYMLINK, ['package.json']), /symlink/)
})

// ---- package manager detection ----

test('pnpm-lock.yaml identifies pnpm', () => {
  assert.equal(detectPackageManager(['package.json', 'pnpm-lock.yaml']), PNPM)
})

test('yarn.lock identifies yarn', () => {
  assert.equal(detectPackageManager(['package.json', 'yarn.lock']), YARN)
})

test('either of bun’s lockfile names identifies bun', () => {
  assert.equal(detectPackageManager(['bun.lockb']), BUN)
  assert.equal(detectPackageManager(['bun.lock']), BUN)
})

test('package-lock.json identifies npm', () => {
  assert.equal(detectPackageManager(['package.json', 'package-lock.json']), NPM)
})

test('a package-lock.json left behind beside pnpm’s lockfile identifies pnpm', () => {
  assert.equal(detectPackageManager(['package-lock.json', 'pnpm-lock.yaml']), PNPM)
})

test('a repo carrying no lockfile identifies no package manager rather than assuming npm', () => {
  assert.equal(detectPackageManager(['package.json', 'README.md']), '')
  assert.equal(detectPackageManager(), '')
})

test('a lockfile that is not at the repository root is not the repo’s lockfile', () => {
  assert.equal(detectPackageManager(['fixtures/yarn.lock']), '')
})

// ---- viable provisioning ----

const npmRepo = { packageManager: NPM, mainTreePath: MAIN_TREE }

test('a repo whose main tree is known prefers the near-free clone to the slow install', () => {
  assert.deepEqual(viableProvisioningStrategies(npmRepo), [CLONE, INSTALL])
})

test('a pnpm repo prefers install to clone — its store already makes a per-worktree install cheap', () => {
  assert.deepEqual(viableProvisioningStrategies({ ...npmRepo, packageManager: PNPM }), [INSTALL, CLONE])
})

test('a repo with no lockfile has no clean-install command, leaving the clone', () => {
  assert.deepEqual(viableProvisioningStrategies({ mainTreePath: MAIN_TREE }), [CLONE])
})

test('an unresolved main tree path leaves nothing to clone from, leaving the install', () => {
  assert.deepEqual(viableProvisioningStrategies({ packageManager: NPM }), [INSTALL])
})

test('a filesystem without copy-on-write support cannot clone, leaving the install', () => {
  assert.deepEqual(viableProvisioningStrategies({ ...npmRepo, copyOnWriteSupported: false }), [INSTALL])
})

test('a repo with no lockfile on a filesystem that cannot clone has nothing viable at all', () => {
  assert.deepEqual(viableProvisioningStrategies({ mainTreePath: MAIN_TREE, copyOnWriteSupported: false }), [])
})

test('a repo no probe answered for has nothing viable', () => {
  assert.deepEqual(viableProvisioningStrategies(), [])
})

test('symlink is never viable on its own — one shared node_modules is asked for by name', () => {
  assert.equal(viableProvisioningStrategies(npmRepo).includes(SYMLINK), false)
  assert.equal(viableProvisioningStrategies({ ...npmRepo, packageManager: PNPM }).includes(SYMLINK), false)
})

test('assume-present is never viable for a fresh worktree — it provisions nothing', () => {
  assert.equal(viableProvisioningStrategies(npmRepo).includes(ASSUME_PRESENT), false)
})
