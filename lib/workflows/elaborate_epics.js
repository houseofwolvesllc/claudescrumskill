// elaborate_epics.js — Pass 2 of two-pass scaffolding.
//
// Invoked by /project-scaffold when two-pass mode is selected.
// Replaces the v1.x Task-spawning prose with one parallel wave.
//
// args: {
//   skeleton: {
//     project: { name, description, global_preamble, non_functional_requirements: string[] },
//     epics: Array<{
//       name, slug, description,
//       slice: { start_line: int, end_line: int },
//       depends_on: string[],
//       shared_design_concerns: string[]
//     }>
//   },
//   prdPath: string,                       // for slicing
//   conventionsPath?: string,              // shared/references/CONVENTIONS.md
//   sessionModel?: "haiku" | "sonnet" | "opus" // what this session runs at; omit and the tiers relative to it inherit
// }
//
// returns: Epic[] with stories[] populated. Failed epics return null;
//          the calling skill marks their stories needs-context.

export const meta = {
  name: 'elaborate-epics',
  description: 'Pass 2 of two-pass scaffolding: per-epic elaboration in parallel.',
  phases: [{ title: 'Elaborate Epics' }],
}

const EPIC_SCHEMA = {
  type: 'object',
  required: ['name', 'slug', 'description', 'stories'],
  properties: {
    name: { type: 'string' },
    slug: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
    description: { type: 'string' },
    depends_on: { type: 'array', items: { type: 'string' } },
    shared_design_concerns: { type: 'array', items: { type: 'string' } },
    stories: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'slug', 'acceptance_criteria', 'points', 'executor'],
        properties: {
          title: { type: 'string' },
          slug: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
          acceptance_criteria: { type: 'array', items: { type: 'string' }, minItems: 1 },
          technical_context: { type: 'string' },
          points: { type: 'integer', enum: [1, 2, 3, 5, 8, 13] },
          executor: { type: 'string', enum: ['claude', 'human', 'cowork'] },
          priority: { type: 'string', enum: ['P0-critical', 'P1-high', 'P2-medium', 'P3-low'] },
          persona: { type: 'string', enum: ['impl', 'ops', 'research'] },
          blocked_by: { type: 'array', items: { type: 'string' } },
          blocks: { type: 'array', items: { type: 'string' } },
          labels: { type: 'array', items: { type: 'string' } },
        },
      },
      minItems: 1,
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

// >>> BEGIN inlined from _shared/resolve_agent_tier.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// resolve_agent_tier — the single authoritative map from an agent stage to the
// (model, effort) tier it runs at. Canonical source of truth; the workflow
// scripts carry an inlined copy of this block (the runtime cannot import), kept
// in sync by inline_sync.test.mjs. Unit-tested by resolve_agent_tier.test.mjs.
//
// Every agent() call names a stage; without a tier the stage inherits the
// session's, so mechanical work (a git probe, a fixed reset sequence, opening a
// PR) runs at whatever the operator's session costs. resolveAgentTier returns
// the option fragment to spread into the agent() call — an absent key means
// "inherit the session", which is the deliberate tier for the reasoning stages.

const MODEL_TIERS = ['haiku', 'sonnet', 'opus'] // ascending capability

// Model targets are symbolic because two of the three are relative to the
// session: only the resolver knows what "one tier down" means for this run.
const CHEAPEST = 'cheapest'
const ONE_TIER_DOWN = 'one-tier-down'
const SESSION = 'session'

const STAGE_TIERS = {
  'detect-layout': { model: CHEAPEST, effort: 'low' },
  'implement': { model: SESSION, effort: SESSION },
  'review': { model: ONE_TIER_DOWN, effort: 'medium' },
  'verify': { model: SESSION, effort: 'low' },
  'pr': { model: CHEAPEST, effort: 'low' },
  'reset': { model: CHEAPEST, effort: 'low' },
  'skeptic': { model: ONE_TIER_DOWN, effort: 'medium' },
  'judge': { model: ONE_TIER_DOWN, effort: 'medium' },
  'elaborate': { model: SESSION, effort: 'medium' },
}

function resolveAgentTier(stage, sessionModel) {
  const tier = STAGE_TIERS[stage]
  if (!tier) {
    throw new Error(
      `resolveAgentTier: unknown stage '${stage}'. ` +
        `Known stages: ${Object.keys(STAGE_TIERS).join(', ')}.`,
    )
  }
  return { ...resolveModel(tier.model, sessionModel), ...resolveEffort(tier.effort) }
}

function resolveModel(target, sessionModel) {
  if (target === SESSION) return {}
  if (target === CHEAPEST) return { model: MODEL_TIERS[0] }
  return oneTierDownFrom(sessionModel)
}

// Degradation: tiering down from the cheapest model is meaningless, so a
// session already at the floor keeps its own model. An unrecognized session
// model (a family this ladder does not describe) is unplaceable, so the stage
// inherits the session rather than guessing a tier that could be an upgrade.
function oneTierDownFrom(sessionModel) {
  const sessionIndex = MODEL_TIERS.indexOf(sessionModel)
  if (sessionIndex === -1) return {}
  return { model: MODEL_TIERS[Math.max(0, sessionIndex - 1)] }
}

function resolveEffort(target) {
  return target === SESSION ? {} : { effort: target }
}
// <<< END inlined from _shared/resolve_agent_tier.mjs <<<

const { skeleton, prdPath, conventionsPath, sessionModel } = normalizeArgs(args, 'elaborate_epics')

if (!skeleton || !skeleton.epics || skeleton.epics.length === 0) {
  log('Empty skeleton — exiting.')
  return []
}

log(`Pass 2: elaborating ${skeleton.epics.length} epics from ${prdPath}.`)

phase('Elaborate Epics')

function buildElaboratePrompt(epic) {
  const siblings = skeleton.epics
    .filter(e => e.slug !== epic.slug)
    .map(e => `  - ${e.slug}: ${e.description}`)
    .join('\n')

  const sharedConcerns = (epic.shared_design_concerns || []).map(c => `  - ${c}`).join('\n')

  return `You are elaborating epic "${epic.name}" (slug: ${epic.slug}) for project "${skeleton.project.name}".

== Project global preamble ==
${skeleton.project.global_preamble || ''}

== Project NFRs ==
${(skeleton.project.non_functional_requirements || []).map(n => `  - ${n}`).join('\n')}

== This epic ==
Description: ${epic.description}
PRD slice: lines ${epic.slice.start_line}–${epic.slice.end_line} of ${prdPath}
Depends on: ${(epic.depends_on || []).join(', ') || 'none'}
Shared design concerns this epic introduces:
${sharedConcerns || '  (none)'}

== Sibling epics (for dependency awareness, NOT for elaboration) ==
${siblings || '  (none)'}

== Your task ==
Read the PRD slice (lines ${epic.slice.start_line}–${epic.slice.end_line}). Produce the complete story list for THIS epic. Each story needs:
  - title (concise imperative)
  - slug (kebab-case)
  - acceptance_criteria (at least one specific, testable item)
  - technical_context (architecture notes, relevant files, approach)
  - points (Fibonacci: 1, 2, 3, 5, 8, 13 per CONVENTIONS.md)
  - executor (claude | human | cowork; per CONVENTIONS.md guidelines)
  - persona (impl | ops | research; default impl)
  - priority (P0/P1/P2/P3)
  - blocked_by, blocks (within this epic or referencing other epics' slugs)
  - labels (per CONVENTIONS.md taxonomy)

${conventionsPath ? `Reference ${conventionsPath} for the label taxonomy and story point guidelines.` : ''}

Return an Epic shape with name, slug, description, depends_on, shared_design_concerns, and stories[] populated.`
}

const elaborated = await parallel(
  skeleton.epics.map(epic => () =>
    agent(buildElaboratePrompt(epic), {
      label: `elaborate:${epic.slug}`,
      phase: 'Elaborate Epics',
      schema: EPIC_SCHEMA,
      ...resolveAgentTier('elaborate', sessionModel),
    })
  )
)

const successes = elaborated.filter(Boolean)
log(`Pass 2 complete: ${successes.length}/${skeleton.epics.length} epics elaborated successfully.`)
if (successes.length < skeleton.epics.length) {
  const failed = skeleton.epics
    .filter((_, i) => !elaborated[i])
    .map(e => e.slug)
  log(`Failed epics (calling skill should mark stories needs-context): ${failed.join(', ')}`)
}

return elaborated
