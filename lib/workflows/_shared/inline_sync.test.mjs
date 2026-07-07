import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { stripExports, extractInlinedBlock } from './inline_sync.mjs'
import { INLINE_MANIFEST } from './inline_manifest.mjs'

function readWorkflow(name) {
  return readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8')
}

function readModule(name) {
  return readFileSync(fileURLToPath(new URL(`./${name}.mjs`, import.meta.url)), 'utf8')
}

for (const { script, modules } of INLINE_MANIFEST) {
  for (const moduleName of modules) {
    test(`${script} inlines an in-sync copy of _shared/${moduleName}.mjs`, () => {
      const inlined = extractInlinedBlock(readWorkflow(script), moduleName)
      const canonical = stripExports(readModule(moduleName))
      assert.equal(
        inlined,
        canonical,
        `${script}'s inlined ${moduleName} block has drifted from the canonical module. ` +
          `Regenerate the block from _shared/${moduleName}.mjs.`,
      )
    })
  }
}
