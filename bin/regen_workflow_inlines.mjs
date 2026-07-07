#!/usr/bin/env node
// regen_workflow_inlines — expand each workflow script's inlined _shared blocks
// from the canonical modules (ADR-0006 S2-negative delivery). The Workflow
// runtime cannot import at runtime, so shared logic is inlined; this tool is the
// codegen-from-single-source path, and inline_sync.test.mjs guards the result.
//
// A script marks each inline slot either with an existing BEGIN/END marker pair
// (re-expanded in place, idempotent) or, on first wiring, with a placeholder
// line `//__INLINE__:<module>`. Run: `node bin/regen_workflow_inlines.mjs`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { INLINE_MANIFEST } from '../lib/workflows/_shared/inline_manifest.mjs'
import { beginMarker, endMarker, buildInlinedBlock } from '../lib/workflows/_shared/inline_sync.mjs'

const WORKFLOWS_DIR = new URL('../lib/workflows/', import.meta.url)

function modulePath(moduleName) {
  return fileURLToPath(new URL(`_shared/${moduleName}.mjs`, WORKFLOWS_DIR))
}

function moduleSource(moduleName) {
  return readFileSync(modulePath(moduleName), 'utf8')
}

function placeInlinedBlock(scriptSource, moduleName, block) {
  const begin = beginMarker(moduleName)
  const end = endMarker(moduleName)
  const startIndex = scriptSource.indexOf(begin)
  if (startIndex !== -1) {
    const endIndex = scriptSource.indexOf(end, startIndex)
    if (endIndex === -1) throw new Error(`Unterminated inline block for '${moduleName}'.`)
    return scriptSource.slice(0, startIndex) + block + scriptSource.slice(endIndex + end.length)
  }
  const placeholder = `//__INLINE__:${moduleName}`
  if (scriptSource.includes(placeholder)) {
    return scriptSource.replace(placeholder, block)
  }
  throw new Error(`No inline slot (marker or ${placeholder}) for '${moduleName}' in script.`)
}

let changed = 0
for (const { script, modules } of INLINE_MANIFEST) {
  const scriptPath = fileURLToPath(new URL(script, WORKFLOWS_DIR))
  const before = readFileSync(scriptPath, 'utf8')
  let after = before
  for (const moduleName of modules) {
    // A not-yet-created module is skipped during incremental development; the
    // drift test (inline_sync.test.mjs) is the strict completeness gate.
    if (!existsSync(modulePath(moduleName))) {
      console.log(`  (skip ${script} ← ${moduleName}: module not created yet)`)
      continue
    }
    after = placeInlinedBlock(after, moduleName, buildInlinedBlock(moduleName, moduleSource(moduleName)))
  }
  if (after !== before) {
    writeFileSync(scriptPath, after)
    changed++
    console.log(`  regenerated inlines in ${script}`)
  }
}
console.log(changed ? `Done — ${changed} script(s) updated.` : 'Done — all inlines already in sync.')
