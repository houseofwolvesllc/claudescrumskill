// multi_spec_queue.js — Sequential per-spec orchestration over a queue.
//
// Invoked by /project-orchestrate Sequential Multi-Path Mode.
//
// args: {
//   specs: Array<{ path: string, slug: string }>,   // pre-sorted (topo + tie-break)
//   flags: { skipOnPause: boolean, merged: boolean },
//   queueStateFilePath: string                      // .claude-scrum-skill/orchestration-queue-state.md
// }
//
// returns: { summaries: PerSpecSummary[], aggregate: AggregateStats }
//
// One-level workflow() nesting: each spec invokes a per-spec orchestration
// sub-workflow (registered separately) which handles its full Phase 1–3 +
// ADR + state cleanup.

export const meta = {
  name: 'multi-spec-queue',
  description: 'Sequential per-spec orchestration over a list of PRD paths.',
  phases: [{ title: 'Spec Queue' }],
}

const { specs, flags = {}, queueStateFilePath } = args
const { skipOnPause = false } = flags

if (!specs || specs.length === 0) {
  log('No specs to orchestrate — exiting.')
  return { summaries: [], aggregate: {} }
}

log(`Multi-spec queue: ${specs.length} specs. --skip-on-pause=${skipOnPause}.`)

phase('Spec Queue')

const summaries = []
const aggregate = { totalStories: 0, totalPoints: 0, totalSprints: 0, totalADRs: 0 }

for (let i = 0; i < specs.length; i++) {
  const spec = specs[i]
  log(`[${i + 1}/${specs.length}] ${spec.slug} — starting`)

  let result
  try {
    // Sub-workflow: per_spec_orchestration handles the full Phase 1 → Phase 2 →
    // Phase 3 → ADR → state cleanup flow for one spec. One-level nesting only.
    result = await workflow('per-spec-orchestration', {
      specPath: spec.path,
      specSlug: spec.slug,
      queueStateFilePath,
      queueIndex: i,
      queueTotal: specs.length,
    })
  } catch (e) {
    const pauseReason = e?.message || 'unknown safety-gate pause'
    if (skipOnPause) {
      log(`[${i + 1}/${specs.length}] ${spec.slug} — paused on safety gate; --skip-on-pause set; marking skipped.`)
      summaries.push({
        specSlug: spec.slug,
        status: 'skipped',
        pauseReason,
        stateArchivePath: `.claude-scrum-skill/orchestration-state-${spec.slug}.skipped.md`,
      })
      continue
    } else {
      log(`[${i + 1}/${specs.length}] ${spec.slug} — paused on safety gate; queue exiting.`)
      summaries.push({
        specSlug: spec.slug,
        status: 'paused',
        pauseReason,
      })
      // Return partial summary so the calling skill can persist the queue state and exit.
      return { summaries, aggregate, paused: true, pausedSpec: spec.slug }
    }
  }

  // Successful completion
  const stats = result?.stats || {}
  aggregate.totalStories += stats.stories || 0
  aggregate.totalPoints += stats.points || 0
  aggregate.totalSprints += stats.sprints || 0
  aggregate.totalADRs += stats.ADRs || 0

  summaries.push({
    specSlug: spec.slug,
    status: 'completed',
    stats,
    stateArchivePath: `.claude-scrum-skill/orchestration-state-${spec.slug}.previous.md`,
  })

  log(`[${i + 1}/${specs.length}] ${spec.slug} — completed (${stats.stories || 0} stories, ${stats.points || 0} pts)`)
}

return { summaries, aggregate }
