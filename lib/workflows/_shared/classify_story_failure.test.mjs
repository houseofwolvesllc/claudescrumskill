import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  codeFailure,
  dependencySetupFailure,
  treeIdentityFailure,
  FAILED,
  INFRASTRUCTURE_FAILED,
} from './classify_story_failure.mjs'

// ---- the code failure ----

test('a story whose code did not work is reported as failed', () => {
  assert.equal(codeFailure('Cannot read properties of undefined').status, FAILED)
})

test('a code failure carries the detail it failed with', () => {
  assert.match(codeFailure('Cannot read properties of undefined').reason, /Cannot read properties of undefined/)
})

test('a code failure says nothing about dependencies — there is nothing there to fix', () => {
  const { reason } = codeFailure('Cannot read properties of undefined')

  assert.doesNotMatch(reason, /dependenc/i)
  assert.doesNotMatch(reason, /infrastructure/i)
})

// ---- the infrastructure failure ----

const cloneFailed = () =>
  dependencySetupFailure({ strategy: 'clone', detail: 'cp -c -R: Operation not supported' })

test('a worktree that could not obtain its dependencies is not reported as failed', () => {
  assert.notEqual(cloneFailed().status, FAILED)
  assert.equal(cloneFailed().status, INFRASTRUCTURE_FAILED)
})

test('the failure names the strategy that failed', () => {
  assert.match(cloneFailed().reason, /'clone'/)
  assert.match(dependencySetupFailure({ strategy: 'install', detail: 'ENOTFOUND registry' }).reason, /'install'/)
})

test('the failure names why it failed, in the words the worktree reported', () => {
  assert.match(cloneFailed().reason, /cp -c -R: Operation not supported/)
})

test('the failure says the story’s code was never exercised, so nobody hunts a defect', () => {
  assert.match(cloneFailed().reason, /never exercised/)
  assert.match(cloneFailed().reason, /not a defect in the story/)
})

test('a worktree that reported no detail still names the strategy rather than an empty why', () => {
  const { reason } = dependencySetupFailure({ strategy: 'symlink' })

  assert.match(reason, /'symlink'/)
  assert.doesNotMatch(reason, /: *$/)
})

// ---- the infrastructure failure, from the other direction ----

const wrongTree = () =>
  treeIdentityFailure({ revision: 'a1b2c3d', detail: '0000000 (the release branch)' })

test('a stage that read some other tree is not reported as failed', () => {
  assert.notEqual(wrongTree().status, FAILED)
  assert.equal(wrongTree().status, INFRASTRUCTURE_FAILED)
})

test('the failure names the revision the tree was supposed to be at', () => {
  assert.match(wrongTree().reason, /a1b2c3d/)
})

test('the failure names where the tree actually was, in the words the stage reported', () => {
  assert.match(wrongTree().reason, /0000000 \(the release branch\)/)
})

test('the failure says nothing it read belongs to the story, so nobody reads it as content', () => {
  assert.match(wrongTree().reason, /nothing it read belongs to this story/)
  assert.match(wrongTree().reason, /not a defect in the story/)
})

test('a stage that reported no revision still names what the tree should have been at', () => {
  const { reason } = treeIdentityFailure({ revision: 'a1b2c3d' })

  assert.match(reason, /a1b2c3d/)
  assert.doesNotMatch(reason, /: *$/)
})

// ---- the two classes are distinct ----

test('the two failure classes report different statuses', () => {
  assert.notEqual(codeFailure('boom').status, cloneFailed().status)
})

test('both infrastructure failures report one status, not one vocabulary each', () => {
  assert.equal(wrongTree().status, cloneFailed().status)
})
