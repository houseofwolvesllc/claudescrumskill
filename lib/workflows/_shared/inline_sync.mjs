// inline_sync — the DRY seam for the S2-negative delivery mechanism.
//
// The Workflow runtime cannot import/require at runtime (ADR-0006), so each
// workflow script carries an inlined copy of the shared logic it needs, wrapped
// in BEGIN/END markers. This module is the single definition of how an inlined
// block is produced from a canonical `_shared/*.mjs` module, and how it is
// extracted back out of a script. inline_sync.test.mjs asserts every script's
// inlined block equals its canonical module (exports stripped), so the copies
// cannot silently drift. Regeneration and drift-checking share this one code
// path — there is no second definition of the transform.

export function beginMarker(moduleName) {
  return `// >>> BEGIN inlined from _shared/${moduleName}.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>`
}

export function endMarker(moduleName) {
  return `// <<< END inlined from _shared/${moduleName}.mjs <<<`
}

// Strip the `export ` keyword so the module body is legal as inlined top-level
// code in the wrapped-eval runtime (export declarations are illegal there).
// Exports only ever appear at column zero in these modules.
export function stripExports(moduleSource) {
  return moduleSource.replace(/^export /gm, '').trim()
}

// The full block, markers included, that a consuming script must contain.
export function buildInlinedBlock(moduleName, moduleSource) {
  return `${beginMarker(moduleName)}\n${stripExports(moduleSource)}\n${endMarker(moduleName)}`
}

// The inner (marker-free) body of a script's inlined block for a module, trimmed
// for comparison. Throws with context when the block is absent or unterminated,
// so a missing inline is a loud test failure rather than a silent pass.
export function extractInlinedBlock(scriptSource, moduleName) {
  const begin = beginMarker(moduleName)
  const end = endMarker(moduleName)
  const startIndex = scriptSource.indexOf(begin)
  if (startIndex === -1) {
    throw new Error(`inline_sync: BEGIN marker for '${moduleName}' not found in script.`)
  }
  const bodyStart = startIndex + begin.length
  const endIndex = scriptSource.indexOf(end, bodyStart)
  if (endIndex === -1) {
    throw new Error(`inline_sync: END marker for '${moduleName}' not found after its BEGIN marker.`)
  }
  return scriptSource.slice(bodyStart, endIndex).trim()
}
