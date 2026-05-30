// adversarial_verify.js — Claimant / skeptic / judge verification of
// emulation findings. Replaces "trust the emulator" with structured verdicts.
//
// Invoked by /project-emulate after raw findings are produced.
//
// args: {
//   findings: EmulationFinding[],     // EmulationFindingSchema-shaped
//   codebaseContext?: { projectRoot: string, languages: string[] }
// }
//
// returns: Array<{ finding, claim, skeptic, verdict }>

export const meta = {
  name: 'adversarial-verify',
  description: 'Claimant / skeptic / judge verification of emulation findings.',
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

const { findings, codebaseContext = {} } = args

if (!findings || findings.length === 0) {
  log('No findings to verify — exiting.')
  return []
}

log(`Verifying ${findings.length} findings with claimant/skeptic/judge.`)

phase('Argue')
phase('Judge')

function claimantPrompt(finding) {
  return `You are arguing that the following emulation finding IS real and accurate.

Finding (severity: ${finding.severity}):
  Title: ${finding.title}
  Category: ${finding.category}
  Body: ${finding.body}
  Affected files: ${(finding.affected_files || []).join(', ') || '(none)'}

Argue the case. Read the affected files. Produce evidence supporting the finding. Cite specific lines / patterns. Default toward "real" unless evidence clearly contradicts.

Return: summary, evidence (array of citations), confidence.`
}

function skepticPrompt(finding) {
  return `You are arguing that the following emulation finding is a FALSE POSITIVE or overstated.

Finding (severity: ${finding.severity}):
  Title: ${finding.title}
  Category: ${finding.category}
  Body: ${finding.body}
  Affected files: ${(finding.affected_files || []).join(', ') || '(none)'}

Argue the case. Read the affected files. Look for: missing context the emulator didn't see, project-specific conventions that make this fine, downstream code that handles the concern, scope-narrowing facts that reduce severity, alternative interpretations.

Return: summary, evidence (array of citations), confidence.`
}

function judgePrompt(finding, claim, skeptic) {
  return `You are the third agent. Two prior agents argued opposing positions on this emulation finding.

Finding:
  Title: ${finding.title}
  Body: ${finding.body}

Claimant argued REAL:
  Summary: ${claim.summary}
  Evidence: ${(claim.evidence || []).join('\n  ')}
  Confidence: ${claim.confidence || 'unspecified'}

Skeptic argued FALSE POSITIVE:
  Summary: ${skeptic.summary}
  Evidence: ${(skeptic.evidence || []).join('\n  ')}
  Confidence: ${skeptic.confidence || 'unspecified'}

Judge: is this finding real or false-positive? Provide rationale. Optionally suggest a severity adjustment (raise / lower / unchanged).

Return: isReal (bool), rationale, confidence, severity_adjustment.`
}

async function verifyOne(finding) {
  const [claim, skeptic] = await parallel([
    () =>
      agent(claimantPrompt(finding), {
        label: `claim:${finding.id}`,
        phase: 'Argue',
        schema: EVIDENCE_SCHEMA,
      }),
    () =>
      agent(skepticPrompt(finding), {
        label: `skeptic:${finding.id}`,
        phase: 'Argue',
        schema: EVIDENCE_SCHEMA,
      }),
  ])

  if (!claim || !skeptic) {
    log(`Skipping judge for finding ${finding.id} — claimant or skeptic agent failed.`)
    return null
  }

  const verdict = await agent(judgePrompt(finding, claim, skeptic), {
    label: `judge:${finding.id}`,
    phase: 'Judge',
    schema: VERDICT_SCHEMA,
  })

  if (!verdict) return null

  return { finding, claim, skeptic, verdict }
}

const verified = await parallel(findings.map(f => () => verifyOne(f)))
const successful = verified.filter(Boolean)

const realCount = successful.filter(v => v.verdict.isReal).length
const falsePositiveCount = successful.length - realCount
log(`Verified ${successful.length}/${findings.length} findings: ${realCount} real, ${falsePositiveCount} false-positive.`)

return verified
