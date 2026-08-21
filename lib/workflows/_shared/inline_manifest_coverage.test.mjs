import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { INLINE_MANIFEST } from './inline_manifest.mjs'

// An inlined module is copied verbatim into a workflow script, where it cannot be
// imported and therefore cannot be tested. The colocated unit test beside the
// canonical source is the ONLY place its behaviour is ever exercised — so a
// module that arrives without one is untested everywhere it runs.
//
// That matters more here than the usual coverage argument. Every defect this
// suite has shipped in this class — a value consumed that nothing supplies —
// lived in inlined code and was found in production rather than by a test.
function sharedModulePath(name, extension) {
  return fileURLToPath(new URL(`${name}${extension}`, import.meta.url))
}

// A module inlined into more than one script is listed once per script.
function manifestModules() {
  return [...new Set(INLINE_MANIFEST.flatMap(entry => entry.modules))].sort()
}

test('every module the inline manifest names exists at its canonical path', () => {
  const missing = manifestModules().filter(name => !existsSync(sharedModulePath(name, '.mjs')))

  assert.deepEqual(missing, [], `manifest names modules with no source: ${missing.join(', ')}`)
})

test('every inlined module keeps a colocated unit test, its only chance to be exercised', () => {
  const untested = manifestModules().filter(name => !existsSync(sharedModulePath(name, '.test.mjs')))

  assert.deepEqual(
    untested,
    [],
    `inlined with no colocated test — once inlined it cannot be imported, so nothing else can reach it: ${untested
      .map(name => `${name}.mjs wants ${name}.test.mjs`)
      .join('; ')}`,
  )
})

test('the manifest is not empty, so neither assertion can pass vacuously', () => {
  assert.ok(manifestModules().length > 0)
})
