// sprint_pipeline.js — per-story sprint execution.
//
// Invoked by /project-orchestrate Phase 1 Step 3. Each story runs its own
// independent chain — implement → review → verify → open PR — with no
// per-stage barriers and concurrency up to min(16, cpu_cores - 2) per the
// Workflow tool's cap.
//
// Concurrency safety. Stories run in parallel against one git repository, so
// the model is built around a single invariant: the main working tree is
// mutated only by the serialized local-mode merge step. Everything else stays
// off it.
//   - Implement and verify run in isolated worktrees (`isolation: 'worktree'`).
//     They create/build the story branch in their own tree, so concurrent
//     `git checkout -b` and commits never race in the shared tree. Branches and
//     commits land in the shared object store and are visible afterward.
//   - Review only diffs two refs (object-store comparison, no checkout), so it
//     never touches the working tree.
//   - Local-mode finalize merges each story branch into the shared release
//     branch in the main tree; these merges are serialized behind a lock so
//     concurrent fan-in merges cannot race. GitHub mode opens independent PRs
//     and needs no lock.
//
// Dependency gating. A story does not start until every blocker that is also in
// this batch has finished `done` (see `blocked_by`). Because a dependent only
// branches after its in-batch blockers have merged into the release branch, it
// builds on their work. Blockers outside this batch are the orchestrator's
// concern — it passes only stories whose external blockers are already resolved
// (SKILL.md "Independence check"). The in-batch graph is assumed acyclic; the
// orchestrate skill validates the dependency DAG (cycle + missing-edge checks)
// before any story reaches this workflow.
//
// args: {
//   stories: Story[],              // StorySchema-shaped
//   epicSlug: string,
//   releaseBranch: string,         // "release/<epic-slug>"
//   contextMdPath?: string,        // <paths.context>/<epicSlug>/CONTEXT.md
//   claudeMdPath?: string,         // project CLAUDE.md
//   backendMode: "local" | "github" | "jira" | "trello",
//   repoIdentifier?: string,       // "owner/repo" — github mode only
//   personaPreambles: Record<string, string>, // persona name → preamble text
//   baselinePath?: string,         // shared/references/ENGINEERING_BASELINE.md — injected into every story
//   situationalGuidance?: string[] // SKILL.md paths (design-patterns, domain-modeling) — core-domain epics only
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

const {
  stories,
  epicSlug,
  releaseBranch,
  contextMdPath,
  claudeMdPath,
  backendMode,
  repoIdentifier,
  personaPreambles = {},
  baselinePath,
  situationalGuidance = [],
} = normalizeArgs(args, 'sprint_pipeline')

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
  const baselineLine = baselinePath
    ? `Before writing any code, read ${baselinePath} — the universal engineering baseline (Clean Code, Test-Driven Development, and the simple-design Arbitration Rule). Follow it for all code: write tests first (red-green-refactor), keep designs simple, and treat the Arbitration Rule as binding. On a direct conflict the project CLAUDE.md wins.`
    : ''
  const situationalLine = situationalGuidance.length
    ? `This is a core-domain story. Also read and apply: ${situationalGuidance.join(', ')}. These are situational guidance and remain subordinate to the baseline's Arbitration Rule — model the domain's invariants first, and reach for a design pattern or domain layer only when a demonstrated axis of variation or an essential business rule warrants it, never speculatively.`
    : ''
  return `${preamble}

---

You are implementing story ${story.slug} on release branch ${releaseBranch}.

${claudeMdLine}
${baselineLine}
${situationalLine}
${contextLine}

**Story:** ${story.title}
**Acceptance criteria:**
${(story.acceptance_criteria || []).map(c => `  - ${c}`).join('\n')}

**Technical context:** ${story.technical_context || '(none provided)'}

**Branch strategy:** You are in an isolated git worktree — work only here; do not touch other branches. Create branch \`story/${story.slug}\` from the latest \`${releaseBranch}\` (\`git checkout -b story/${story.slug} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. Implement. Commit with a clear message. Return the branch name, the commit SHAs, and any notes.

Do NOT open a PR yet. Do NOT merge. The next stage handles review.`
}

function buildReviewPrompt(impl, story) {
  return `You are reviewing the implementation of story ${story.slug} on branch ${impl.branch}.

Read the diff between ${releaseBranch} and ${impl.branch} with \`git diff ${releaseBranch}...${impl.branch}\` — do NOT check out either branch (other stories run concurrently in this repository; checking out would disturb the shared working tree).

Story acceptance criteria:
${(story.acceptance_criteria || []).map(c => `  - ${c}`).join('\n')}

Review for: correctness against acceptance criteria, project convention compliance (per CLAUDE.md${baselinePath ? ` and the engineering baseline at ${baselinePath}` : ''}), and obvious defects. ${baselinePath ? 'Confirm the baseline was honored: tests accompany the code and the design is the simplest that satisfies the story (no unearned abstraction). ' : ''}Do NOT bikeshed style the project doesn't enforce.

Return a ReviewVerdict: recommendation (accept | accept-with-followups | block), findings grouped by severity, and a one-paragraph summary.`
}

function buildVerifyPrompt(review, story) {
  return `You are running a lightweight verification on story ${story.slug}.

You are in an isolated git worktree — check out \`story/${story.slug}\` here (\`git checkout story/${story.slug}\`) so any build artifacts stay off the shared working tree. If the project has a build/lint/test command, run it on the story branch. If not, perform a smoke read of the changed files to confirm no obvious runtime defects (broken imports, syntax errors, dangling references).

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

const batchSlugs = new Set(stories.map(story => story.slug))

/**
 * Blockers of `story` that are also in this batch, by trailing slug.
 * blocked_by entries may be bare slugs or "<epic>/<slug>" references. A story
 * cannot block itself, and blockers outside the batch are the orchestrator's
 * concern (it only passes stories whose external blockers are resolved).
 */
function inBatchBlockers(story) {
  return (story.blocked_by || [])
    .map(reference => reference.split('/').pop())
    .filter(slug => slug !== story.slug && batchSlugs.has(slug))
}

// Serializes local-mode merges onto the shared release branch: each merge runs
// only after the previous one settles, success or failure, so a failed merge
// never stalls the rest. GitHub mode opens independent PRs and does not use it.
let mergeChain = Promise.resolve()
function serializeMerge(runMerge) {
  const merged = mergeChain.then(runMerge, runMerge)
  mergeChain = merged.then(() => {}, () => {})
  return merged
}

function reviewBlocked(story, impl, review) {
  return makeSprintStoryReturn({
    storySlug: story.slug,
    status: 'blocked',
    branch: impl.branch,
    commits: impl.commits,
    blockers: [
      ...review.findings.critical.map(finding => finding.title),
      ...review.findings.warning.map(finding => finding.title),
    ],
    reason: 'Review recommended block.',
  })
}

function verifyBlocked(story, impl, verify) {
  return makeSprintStoryReturn({
    storySlug: story.slug,
    status: 'blocked',
    branch: impl.branch,
    commits: impl.commits,
    blockers: [verify.notes || 'verification failed'],
    reason: 'Verification failed.',
  })
}

function dependencyBlocked(story, unmet) {
  return makeSprintStoryReturn({
    storySlug: story.slug,
    status: 'blocked',
    blockers: unmet.map(slug => `upstream story ${slug} did not complete`),
    reason: 'Upstream in-sprint dependency did not complete.',
  })
}

// Each story's terminal promise, registered before any chain runs so a
// dependent can always await its blocker regardless of array order.
const terminal = new Map()

async function runStory(story) {
  const blockers = inBatchBlockers(story)
  if (blockers.length) {
    const outcomes = await Promise.all(blockers.map(slug => terminal.get(slug)))
    const unmet = blockers.filter((_, index) => outcomes[index]?.status !== 'done')
    if (unmet.length) {
      log(`Skipping ${story.slug}: upstream ${unmet.join(', ')} did not complete.`)
      return dependencyBlocked(story, unmet)
    }
  }

  const impl = await agent(buildImplementPrompt(story), {
    label: `impl:${story.slug}`,
    phase: 'Implement',
    schema: IMPL_RETURN_SCHEMA,
    isolation: 'worktree',
  })
  if (!impl) return null

  const review = await agent(buildReviewPrompt(impl, story), {
    label: `review:${story.slug}`,
    phase: 'Review',
    schema: REVIEW_VERDICT_SCHEMA,
  })
  if (!review) return null
  if (review.recommendation === 'block') return reviewBlocked(story, impl, review)

  const verify = await agent(buildVerifyPrompt(review, story), {
    label: `verify:${story.slug}`,
    phase: 'Verify',
    schema: VERIFY_RETURN_SCHEMA,
    isolation: 'worktree',
  })
  if (!verify) return null
  if (verify.verifyStatus === 'fail') return verifyBlocked(story, impl, verify)

  const finalize = () =>
    agent(buildOpenPRPrompt(verify, story, impl), {
      label: `pr:${story.slug}`,
      phase: 'Open PR',
      schema: SPRINT_STORY_RETURN_SCHEMA,
    })

  // Local mode mutates the shared release branch — serialize. GitHub mode opens
  // an independent PR and can run concurrently.
  return backendMode === 'github' ? finalize() : serializeMerge(finalize)
}

// Open the gate only after every terminal promise is registered, so a
// dependent's blocker lookup never races an unregistered entry.
let openGate
const gate = new Promise(resolve => {
  openGate = resolve
})
for (const story of stories) {
  terminal.set(
    story.slug,
    // Isolate each chain: a thrown agent or stage becomes a 'failed' result
    // rather than rejecting Promise.all and tearing down the whole batch. A
    // failed (not 'done') outcome also correctly blocks any dependent.
    gate.then(() => runStory(story)).catch(error => {
      const detail = error?.message || String(error)
      log(`Story ${story.slug} errored: ${detail}`)
      return makeSprintStoryReturn({
        storySlug: story.slug,
        status: 'failed',
        reason: `Unhandled error: ${detail}`,
      })
    })
  )
}
openGate()

const results = await Promise.all(stories.map(story => terminal.get(story.slug)))
return results.filter(Boolean)
