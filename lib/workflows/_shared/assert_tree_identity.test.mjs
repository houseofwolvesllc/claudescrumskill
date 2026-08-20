import { test } from 'node:test'
import assert from 'node:assert/strict'

import { treeIdentityAssertion, mismatchedHead } from './assert_tree_identity.mjs'

const HEAD_COMMIT = '9f2c1ab4d5e6f708192a3b4c5d6e7f8091a2b3c4'
const SOME_OTHER_COMMIT = '3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f'

const assertionForHeadCommit = () => treeIdentityAssertion(HEAD_COMMIT)

// ---- the tree is the one the stage was placed at ----

test('identity is established before any file is read', () => {
  const assertion = assertionForHeadCommit()

  assert.match(assertion, /before you read or report on any file/i)
  assert.match(assertion, /git rev-parse HEAD/)
})

test('the tree is measured against the commit the implement stage reported', () => {
  assert.match(assertionForHeadCommit(), new RegExp(HEAD_COMMIT))
})

test('the SHA the stage stood at is returned on every path, not only the failing one', () => {
  const assertion = assertionForHeadCommit()

  assert.match(assertion, /observedHead/)
  assert.match(assertion, /on every path/i)
})

// ---- the tree is some other tree ----

test('a tree at some other commit is reported as a tree-identity failure', () => {
  assert.match(assertionForHeadCommit(), /treeIdentityFailure/)
})

test('a tree at some other commit ends the stage instead of describing its content', () => {
  const assertion = assertionForHeadCommit()

  assert.match(assertion, /stop/i)
  assert.match(assertion, /saying nothing about file content/i)
})

// ---- there is no commit to measure against ----

test('an implement result carrying no commit asserts nothing rather than failing', () => {
  assert.equal(treeIdentityAssertion(''), '')
  assert.equal(treeIdentityAssertion(undefined), '')
})

// ---- the SHA the stage stood at, compared where it is checkable ----

test('a tree standing at the commit it was placed at reports no mismatch', () => {
  assert.equal(mismatchedHead({ assigned: HEAD_COMMIT, observed: HEAD_COMMIT }), '')
})

test('a tree standing elsewhere reports the SHA it was standing at', () => {
  assert.equal(mismatchedHead({ assigned: HEAD_COMMIT, observed: SOME_OTHER_COMMIT }), SOME_OTHER_COMMIT)
})

test('a comparison missing either side reports no mismatch rather than a failure', () => {
  assert.equal(mismatchedHead({ assigned: '', observed: SOME_OTHER_COMMIT }), '')
  assert.equal(mismatchedHead({ assigned: HEAD_COMMIT, observed: undefined }), '')
})
