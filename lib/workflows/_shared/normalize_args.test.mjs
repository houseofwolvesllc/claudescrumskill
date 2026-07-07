import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeArgs } from './normalize_args.mjs'

test('normalizeArgs returns a plain object by the same reference (no clone)', () => {
  const input = { stories: [], epicSlug: 'x' }
  const result = normalizeArgs(input, 'sprint_pipeline')
  assert.equal(result, input)
})

test('normalizeArgs parses a JSON string of an object into an equal object', () => {
  const result = normalizeArgs('{"epicSlug":"core","points":3}', 'sprint_pipeline')
  assert.deepEqual(result, { epicSlug: 'core', points: 3 })
})

test('normalizeArgs re-parses a double-encoded JSON string down to the object', () => {
  const doubleEncoded = JSON.stringify(JSON.stringify({ a: 1, b: 'two' }))
  const result = normalizeArgs(doubleEncoded, 'review_panel')
  assert.deepEqual(result, { a: 1, b: 'two' })
})

test('normalizeArgs throws with the workflow name when the string is malformed JSON', () => {
  assert.throws(
    () => normalizeArgs('{ not json', 'elaborate_epics'),
    /normalizeArgs\(elaborate_epics\): args is a string but not valid JSON\./,
  )
})

test('normalizeArgs throws with context when the payload parses to an array ("[]")', () => {
  assert.throws(
    () => normalizeArgs('[]', 'adversarial_verify'),
    /normalizeArgs\(adversarial_verify\): args resolved to an array; expected a non-null, non-array object\./,
  )
})

test('normalizeArgs throws with context when the payload parses to a number ("42")', () => {
  assert.throws(
    () => normalizeArgs('42', 'sprint_pipeline'),
    /args resolved to number; expected a non-null, non-array object\./,
  )
})

test('normalizeArgs throws with context when the payload parses to null ("null")', () => {
  assert.throws(
    () => normalizeArgs('null', 'sprint_pipeline'),
    /args resolved to null; expected a non-null, non-array object\./,
  )
})

test('normalizeArgs throws on a JSON string whose payload is itself a bare word ("\\"x\\"")', () => {
  // '"x"' parses to the string "x"; the double-encoding branch reparses "x",
  // which is not valid JSON, so it fails loud rather than returning a string.
  assert.throws(() => normalizeArgs('"x"', 'sprint_pipeline'), /args is a string but not valid JSON\./)
})

test('normalizeArgs throws (no implicit {} default) when raw is null', () => {
  assert.throws(() => normalizeArgs(null, 'sprint_pipeline'), /args resolved to null;/)
})

test('normalizeArgs throws (no implicit {} default) when raw is undefined', () => {
  assert.throws(() => normalizeArgs(undefined, 'sprint_pipeline'), /args resolved to undefined;/)
})

test('normalizeArgs throws when raw is an array', () => {
  assert.throws(() => normalizeArgs([1, 2, 3], 'sprint_pipeline'), /args resolved to an array;/)
})

test('normalizeArgs throws when raw is a non-string primitive', () => {
  assert.throws(() => normalizeArgs(42, 'sprint_pipeline'), /args resolved to number;/)
})
