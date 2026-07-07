// normalize_args — the single authoritative representation of the workflow
// args string-or-object contract. Canonical source of truth; the workflow
// scripts carry an inlined copy of this block (the runtime cannot import), kept
// in sync by inline_sync.test.mjs. Unit-tested by normalize_args.test.mjs (E1).
//
// The workflow runtime injects `args`; some hosts deliver it as a parsed object,
// others as a JSON string. normalizeArgs collapses both to a plain object and
// fails loud on anything that is not one — never a silent undefined at the
// destructure, never an implicit {} default.

export function normalizeArgs(raw, workflowName) {
  const value = parseIfString(raw, workflowName)
  assertPlainObject(value, workflowName)
  return value
}

function parseIfString(raw, workflowName) {
  if (typeof raw !== 'string') return raw
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error(
      `normalizeArgs(${workflowName}): args is a string but not valid JSON.`,
      { cause },
    )
  }
  // Double-encoded: a JSON string whose payload is itself a JSON string.
  return typeof parsed === 'string' ? parseIfString(parsed, workflowName) : parsed
}

function assertPlainObject(value, workflowName) {
  const isPlainObject =
    value !== null && typeof value === 'object' && !Array.isArray(value)
  if (isPlainObject) return
  throw new Error(
    `normalizeArgs(${workflowName}): args resolved to ` +
      `${Array.isArray(value) ? 'an array' : String(value === null ? 'null' : typeof value)}; ` +
      `expected a non-null, non-array object.`,
  )
}
