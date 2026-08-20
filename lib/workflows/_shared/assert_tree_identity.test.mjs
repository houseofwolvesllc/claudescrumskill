import { test } from 'node:test'
import assert from 'node:assert/strict'

import { treeIdentityAssertion } from './assert_tree_identity.mjs'

const HEAD_COMMIT = '9f2c1ab4d5e6f708192a3b4c5d6e7f8091a2b3c4'

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
