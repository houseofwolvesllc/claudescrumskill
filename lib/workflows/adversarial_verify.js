// adversarial_verify.js — Skeptic / judge verification of emulation findings.
// Replaces "trust the emulator" with structured verdicts. The finding is its
// own affirmative case, so only the opposing position needs an agent to argue
// it; the judge weighs the finding against the skeptic's rebuttal.
//
// Invoked by /project-emulate after raw findings are produced.
//
// args: {
//   findings: EmulationFinding[],     // EmulationFindingSchema-shaped
//   codebaseContext?: { projectRoot: string, languages: string[] }
// }
//
// returns: Array<{ finding, skeptic, verdict }>

export const meta = {
  name: 'adversarial-verify',
  description: 'Skeptic / judge verification of emulation findings.',
  phases: [
    { title: 'Argue' },
    { title: 'Judge' },
  ],
}

const EVIDENCE_SCHEMA = {
  type: 'object',
  required: ['summary', 'evidence'],
  properties: {
    summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' }, minItems: 1 },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal', 'rationale'],
  properties: {
    isReal: { type: 'boolean' },
    rationale: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    severity_adjustment: {
      type: 'string',
      enum: ['raise', 'lower', 'unchanged'],
      description: 'Whether to raise or lower severity vs original finding.',
    },
  },
}

// >>> BEGIN inlined from _shared/normalize_args.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// normalize_args — the single authoritative representation of the workflow
// args string-or-object contract. Canonical source of truth; the workflow
// scripts carry an inlined copy of this block (the runtime cannot import), kept
// in sync by inline_sync.test.mjs. Unit-tested by normalize_args.test.mjs (E1).
//
// The workflow runtime injects `args`; some hosts deliver it as a parsed object,
// others as a JSON string. normalizeArgs collapses both to a plain object and
// fails loud on anything that is not one — never a silent undefined at the
// destructure, never an implicit {} default.

function normalizeArgs(raw, workflowName) {
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
// <<< END inlined from _shared/normalize_args.mjs <<<

const { findings, codebaseContext = {} } = normalizeArgs(args, 'adversarial_verify')

if (!findings || findings.length === 0) {
  log('No findings to verify — exiting.')
  return []
}

log(`Verifying ${findings.length} findings with skeptic/judge.`)

phase('Argue')
phase('Judge')

function skepticPrompt(finding) {
  return `You are arguing that the following emulation finding is a FALSE POSITIVE or overstated.

${findingBrief(finding)}

Argue the case. Read the affected files. Look for: missing context the emulator didn't see, project-specific conventions that make this fine, downstream code that handles the concern, scope-narrowing facts that reduce severity, alternative interpretations.

Return: summary, evidence (array of citations), confidence.`
}

function judgePrompt(finding, skeptic) {
  return `You are the second agent. The finding below states the case that it IS real and accurate; a skeptic agent argued the opposing position.

${findingBrief(finding)}

Skeptic argued FALSE POSITIVE:
  Summary: ${skeptic.summary}
  Evidence: ${(skeptic.evidence || []).join('\n  ')}
  Confidence: ${skeptic.confidence || 'unspecified'}

Judge: is this finding real or false-positive? Read the affected files where the skeptic's rebuttal turns on them. Provide rationale. Optionally suggest a severity adjustment (raise / lower / unchanged).

Return: isReal (bool), rationale, confidence, severity_adjustment.`
}

function findingBrief(finding) {
  return `Finding (severity: ${finding.severity}):
  Title: ${finding.title}
  Category: ${finding.category}
  Body: ${finding.body}
  Affected files: ${(finding.affected_files || []).join(', ') || '(none)'}`
}

async function verifyOne(finding) {
  const skeptic = await agent(skepticPrompt(finding), {
    label: `skeptic:${finding.id}`,
    phase: 'Argue',
    schema: EVIDENCE_SCHEMA,
  })

  if (!skeptic) {
    log(`Skipping judge for finding ${finding.id} — skeptic agent failed.`)
    return null
  }

  const verdict = await agent(judgePrompt(finding, skeptic), {
    label: `judge:${finding.id}`,
    phase: 'Judge',
    schema: VERDICT_SCHEMA,
  })

  if (!verdict) return null

  return { finding, skeptic, verdict }
}

const verified = await parallel(findings.map(f => () => verifyOne(f)))
const successful = verified.filter(Boolean)

const realCount = successful.filter(v => v.verdict.isReal).length
const falsePositiveCount = successful.length - realCount
log(`Verified ${successful.length}/${findings.length} findings: ${realCount} real, ${falsePositiveCount} false-positive.`)

return verified
