// sprint_pipeline.js — per-story sprint execution as a pipeline.
//
// Invoked by /project-orchestrate Phase 1 Step 3. Replaces the v1.x
// Task-spawning prose with per-stage barrier removal and concurrency up
// to min(16, cpu_cores - 2) per the Workflow tool's cap.
//
// args: {
//   stories: Story[],              // StorySchema-shaped
//   epicSlug: string,
//   releaseBranch: string,         // "release/<epic-slug>"
//   contextMdPath?: string,        // <paths.context>/<epicSlug>/CONTEXT.md
//   claudeMdPath?: string,         // project CLAUDE.md
//   backendMode: "local" | "github" | "jira" | "trello",
//   repoIdentifier?: string,       // "owner/repo" — github mode only
//   personaPreambles: Record<string, string>  // persona name → preamble text
// }
//
// returns: SprintStoryReturn[] (one per story; failed items filtered to null upstream)

export const meta = {
  name: 'sprint-pipeline',
  description: 'Per-story sprint execution: implement → review → verify → open PR',
  phases: [
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Open PR' },
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
  },
}

const IMPL_RETURN_SCHEMA = {
  type: 'object',
  required: ['storySlug', 'branch', 'commits'],
  properties: {
    storySlug: { type: 'string' },
    branch: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const VERIFY_RETURN_SCHEMA = {
  type: 'object',
  required: ['storySlug', 'verifyStatus'],
  properties: {
    storySlug: { type: 'string' },
    verifyStatus: { type: 'string', enum: ['pass', 'warn', 'fail'] },
    notes: { type: 'string' },
  },
}

const SPRINT_STORY_RETURN_SCHEMA = {
  type: 'object',
  required: ['storySlug', 'status'],
  properties: {
    storySlug: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked', 'failed'] },
    branch: { type: 'string' },
    prUrl: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
}

/**
 * Build a SprintStoryReturn-shaped object for short-circuit paths
 * (review-block, verify-fail). The shape conforms to
 * SPRINT_STORY_RETURN_SCHEMA above; keeping the helper alongside ensures
 * any future schema change requires updating both at once.
 */
function makeSprintStoryReturn({ storySlug, status, branch, commits, prUrl, blockers, reason }) {
  const out = { storySlug, status }
  if (branch !== undefined) out.branch = branch
  if (commits !== undefined) out.commits = commits
  if (prUrl !== undefined) out.prUrl = prUrl
  if (blockers !== undefined) out.blockers = blockers
  if (reason !== undefined) out.reason = reason
  return out
}

const {
  stories,
  epicSlug,
  releaseBranch,
  contextMdPath,
  claudeMdPath,
  backendMode,
  repoIdentifier,
  personaPreambles = {},
} = args

if (!stories || stories.length === 0) {
  log('No stories in sprint — exiting.')
  return []
}

log(`Sprint pipeline: ${stories.length} stories on release branch ${releaseBranch} (backend=${backendMode}).`)

function buildImplementPrompt(story) {
  const persona = story.persona || 'impl'
  const preamble = personaPreambles[persona] || ''
  const claudeMdLine = claudeMdPath
    ? `Before writing any code, read ${claudeMdPath} and follow every convention.`
    : 'Read the project CLAUDE.md (if present) and follow every convention.'
  const contextLine = contextMdPath
    ? `Before writing any code, read ${contextMdPath} if it exists. Its Naming, File Layout, Shared Types, and Patterns sections are binding for this epic — they override generic CLAUDE.md conventions for this epic.`
    : ''
  return `${preamble}

---

You are implementing story ${story.slug} on release branch ${releaseBranch}.

${claudeMdLine}
${contextLine}

**Story:** ${story.title}
**Acceptance criteria:**
${(story.acceptance_criteria || []).map(c => `  - ${c}`).join('\n')}

**Technical context:** ${story.technical_context || '(none provided)'}

**Branch strategy:** Create branch \`story/${story.slug}\` from \`${releaseBranch}\`. Implement. Commit with a clear message. Return the branch name, the commit SHAs, and any notes.

Do NOT open a PR yet. Do NOT merge. The next stage handles review.`
}

function buildReviewPrompt(impl, story) {
  return `You are reviewing the implementation of story ${story.slug} on branch ${impl.branch}.

Read the diff between ${releaseBranch} and ${impl.branch}.

Story acceptance criteria:
${(story.acceptance_criteria || []).map(c => `  - ${c}`).join('\n')}

Review for: correctness against acceptance criteria, project convention compliance (per CLAUDE.md), and obvious defects. Do NOT bikeshed style the project doesn't enforce.

Return a ReviewVerdict: recommendation (accept | accept-with-followups | block), findings grouped by severity, and a one-paragraph summary.`
}

function buildVerifyPrompt(review, story) {
  return `You are running a lightweight verification on story ${story.slug}.

If the project has a build/lint/test command, run it on the story branch. If not, perform a smoke read of the changed files to confirm no obvious runtime defects (broken imports, syntax errors, dangling references).

Return verifyStatus (pass | warn | fail) and brief notes.`
}

function buildOpenPRPrompt(verify, story, impl) {
  const ghOrLocal =
    backendMode === 'github'
      ? `Open a PR via gh CLI targeting ${releaseBranch}. Capture the PR URL.`
      : `Merge story/${story.slug} into ${releaseBranch} locally. Capture the merge commit SHA.`
  return `You are finalizing story ${story.slug}.

Verify status: ${verify.verifyStatus}. Review recommendation: (from prior stage).

${ghOrLocal}

Return SprintStoryReturn: storySlug, status (done | blocked | failed), branch, prUrl (github mode) or merge commit (local mode), commits[], blockers[] (if blocked), reason (if failed).`
}

phase('Implement')
phase('Review')
phase('Verify')
phase('Open PR')

const results = await pipeline(
  stories,
  // Stage 1: Implement
  story =>
    agent(buildImplementPrompt(story), {
      label: `impl:${story.slug}`,
      phase: 'Implement',
      schema: IMPL_RETURN_SCHEMA,
    }),
  // Stage 2: Review
  (impl, story) =>
    impl
      ? agent(buildReviewPrompt(impl, story), {
          label: `review:${story.slug}`,
          phase: 'Review',
          schema: REVIEW_VERDICT_SCHEMA,
        }).then(review => ({ impl, review }))
      : null,
  // Stage 3: Verify
  (prev, story) =>
    prev
      ? agent(buildVerifyPrompt(prev.review, story), {
          label: `verify:${story.slug}`,
          phase: 'Verify',
          schema: VERIFY_RETURN_SCHEMA,
        }).then(verify => ({ ...prev, verify }))
      : null,
  // Stage 4: Open PR (or local merge)
  (prev, story) => {
    if (!prev) return null
    const { impl, review, verify } = prev
    // If the reviewer said block, short-circuit to blocked status without an openPR call.
    if (review.recommendation === 'block') {
      const blockers = [
        ...review.findings.critical.map(f => f.title),
        ...review.findings.warning.map(f => f.title),
      ]
      return makeSprintStoryReturn({
        storySlug: story.slug,
        status: 'blocked',
        branch: impl.branch,
        commits: impl.commits,
        blockers,
        reason: 'Review recommended block.',
      })
    }
    // If verify failed, also short-circuit.
    if (verify.verifyStatus === 'fail') {
      return makeSprintStoryReturn({
        storySlug: story.slug,
        status: 'blocked',
        branch: impl.branch,
        commits: impl.commits,
        blockers: [verify.notes || 'verification failed'],
        reason: 'Verification failed.',
      })
    }
    return agent(buildOpenPRPrompt(verify, story, impl), {
      label: `pr:${story.slug}`,
      phase: 'Open PR',
      schema: SPRINT_STORY_RETURN_SCHEMA,
    })
  }
)

return results.filter(Boolean)
