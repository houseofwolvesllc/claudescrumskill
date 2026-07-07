// review_panel.js — Multi-lens parallel review with aggregated verdict.
//
// Invoked by /project-cleanup and /code-review for the review gate.
//
// args: {
//   diff: string,
//   files: Array<{ path: string, contents: string }>,
//   lenses?: Array<"correctness" | "security" | "style" | "tests">,
//   projectConventionsPath?: string    // CLAUDE.md
// }
//
// returns: {
//   panelVerdict: ReviewVerdict (aggregated),
//   perLensVerdicts: Record<lens, ReviewVerdict>
// }

export const meta = {
  name: 'review-panel',
  description: 'Multi-lens parallel review with aggregated verdict.',
  phases: [
    { title: 'Per-Lens Review' },
    { title: 'Aggregate' },
  ],
}

const REVIEW_VERDICT_SCHEMA = {
  type: 'object',
  required: ['recommendation', 'findings', 'summary'],
  properties: {
    recommendation: { type: 'string', enum: ['accept', 'accept-with-followups', 'block'] },
    findings: {
      type: 'object',
      required: ['critical', 'warning', 'info'],
      properties: {
        critical: { type: 'array' },
        warning: { type: 'array' },
        info: { type: 'array' },
      },
    },
    summary: { type: 'string' },
    lens: { type: 'string' },
  },
}

const DEFAULT_LENSES = ['correctness', 'security', 'style', 'tests']

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

const { diff, files, lenses = DEFAULT_LENSES, projectConventionsPath } = normalizeArgs(args, 'review_panel')

if (!diff && (!files || files.length === 0)) {
  log('No diff and no files — nothing to review.')
  return {
    panelVerdict: {
      recommendation: 'accept',
      findings: { critical: [], warning: [], info: [] },
      summary: 'Nothing to review.',
    },
    perLensVerdicts: {},
  }
}

log(`Review panel: ${lenses.length} lenses (${lenses.join(', ')}).`)

phase('Per-Lens Review')
phase('Aggregate')

const LENS_INSTRUCTIONS = {
  correctness: `Focus on: does the code do what the acceptance criteria / change description requires? Are there logic errors, off-by-ones, missed branches, broken invariants? Are edge cases handled?`,
  security: `Focus on: injection sinks (SQL, shell, HTML, path), missing authentication checks, broken authorization, secret exposure, unvalidated user input reaching dangerous APIs, permission expansion without justification.`,
  style: `Focus on: project convention adherence (per CLAUDE.md), naming consistency, file organization, import ordering. Do NOT bikeshed style the project doesn't enforce.`,
  tests: `Focus on: are new behaviors covered by tests? Are existing tests still meaningful? Are tests testing behavior or implementation? Coverage at integration seams?`,
}

function buildLensPrompt(lens) {
  const conventions = projectConventionsPath
    ? `Read ${projectConventionsPath} first — review against the project's actual conventions, not generic standards.`
    : `Read the project CLAUDE.md if it exists — review against the project's actual conventions, not generic standards.`
  return `You are reviewing a code change through the **${lens}** lens.

${conventions}

Lens focus: ${LENS_INSTRUCTIONS[lens] || '(no specific instructions for this lens)'}

== Diff ==
${diff || '(no diff provided; review the files below directly)'}

== Changed files (full contents) ==
${(files || []).map(f => `--- ${f.path} ---\n${f.contents}`).join('\n\n')}

Return a ReviewVerdict for THIS LENS ONLY:
  - recommendation (accept | accept-with-followups | block)
  - findings grouped by severity (critical | warning | info)
  - summary (one-paragraph)
  - lens: "${lens}"

Be specific. "This could be better" is not a finding. Cite file:line where applicable.`
}

const perLensResults = await parallel(
  lenses.map(lens => () =>
    agent(buildLensPrompt(lens), {
      label: `review:${lens}`,
      phase: 'Per-Lens Review',
      schema: REVIEW_VERDICT_SCHEMA,
    })
  )
)

const perLensVerdicts = {}
lenses.forEach((lens, i) => {
  if (perLensResults[i]) {
    perLensVerdicts[lens] = perLensResults[i]
  }
})

const validVerdicts = Object.values(perLensVerdicts)

if (validVerdicts.length === 0) {
  log('All lens reviewers failed — returning a default block verdict.')
  return {
    panelVerdict: {
      recommendation: 'block',
      findings: {
        critical: [{
          title: 'Review panel failed to produce any verdict',
          severity: 'critical',
          body: 'All lens reviewers returned null.',
        }],
        warning: [],
        info: [],
      },
      summary: 'Review panel non-functional.',
    },
    perLensVerdicts: {},
  }
}

// Aggregation rule: any block → panel block; any accept-with-followups → panel accept-with-followups; else accept.
let panelRecommendation = 'accept'
if (validVerdicts.some(v => v.recommendation === 'block')) {
  panelRecommendation = 'block'
} else if (validVerdicts.some(v => v.recommendation === 'accept-with-followups')) {
  panelRecommendation = 'accept-with-followups'
}

// Union findings across lenses, preserving lens attribution.
const findings = { critical: [], warning: [], info: [] }
for (const [lens, verdict] of Object.entries(perLensVerdicts)) {
  for (const sev of ['critical', 'warning', 'info']) {
    for (const f of verdict.findings[sev] || []) {
      findings[sev].push({ ...f, lens })
    }
  }
}

const summary = `Panel verdict: ${panelRecommendation}. ${validVerdicts.length}/${lenses.length} lenses reported. ${findings.critical.length} critical, ${findings.warning.length} warning, ${findings.info.length} info findings (union across lenses).`

log(summary)

return {
  panelVerdict: {
    recommendation: panelRecommendation,
    findings,
    summary,
  },
  perLensVerdicts,
}
