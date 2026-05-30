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
//   conventionsPath?: string               // shared/references/CONVENTIONS.md
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

const { skeleton, prdPath, conventionsPath } = args

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
