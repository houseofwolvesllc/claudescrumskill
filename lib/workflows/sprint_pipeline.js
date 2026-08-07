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
    { title: 'Detect' },
    { title: 'Implement' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Reset' },
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

// >>> BEGIN inlined from _shared/detect_repo_layout.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// detect_repo_layout — pick the isolation strategy from whether node_modules is
// tracked. Canonical source of truth; the pure classifier is inlined into
// sprint_pipeline.js (the runtime cannot import), fed the stdout of
// `git ls-files node_modules` obtained via an agent (the runtime has no
// child_process — ADR-0006). detectIsolationStrategy is execGit-injected and
// exists only for the unit tests, which drive it against real git in temp dirs.
// Unit-tested by detect_repo_layout.test.mjs (E2).
//
// Axis: node_modules TRACKED vs UNTRACKED (NOT hoisted vs non-hoisted). A fresh
// `git worktree add` materializes tracked files only, so gitignored node_modules
// is absent regardless of workspace hoisting.

const WORKTREE = 'worktree'
const SERIAL_IN_TREE = 'serial-in-tree'

// Pure. Non-empty `git ls-files node_modules` stdout → tracked → worktree-safe;
// empty stdout (git exits 0 with no output when nothing matches — there is no
// exit-1 "no" case) → untracked → serial-in-tree; a command error (non-git dir,
// git exit 128, or any invocation failure) → serial-in-tree, the safe default.
function classifyIsolationStrategy(lsFilesStdout, commandErrored) {
  if (commandErrored) return SERIAL_IN_TREE
  return String(lsFilesStdout ?? '').trim().length > 0 ? WORKTREE : SERIAL_IN_TREE
}

// execGit(args: string[]) => stdout string, throwing on command failure. The
// command-error case is caught here and mapped to the safe default, so a
// detector failure NEVER kills the batch (F9a).
function detectIsolationStrategy(repoRoot, execGit) {
  try {
    const stdout = execGit(['-C', repoRoot, 'ls-files', 'node_modules'])
    return classifyIsolationStrategy(stdout, false)
  } catch {
    return classifyIsolationStrategy('', true)
  }
}
// <<< END inlined from _shared/detect_repo_layout.mjs <<<

// >>> BEGIN inlined from _shared/topological_order.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// topological_order — order stories so every in-batch blocker precedes its
// dependents (Kahn's algorithm over in-batch blockers). Canonical source of
// truth; inlined into sprint_pipeline.js for serial-in-tree execution. Pure and
// unit-tested by topological_order.test.mjs (E3).
//
// This is NET-NEW logic and is required: a naive array-order serialization
// re-deadlocks when a dependent precedes its blocker in the array (the
// dependent would await a blocker the serial loop has not started). The DAG is
// validated upstream, so a cycle is can't-happen — but house style is fail-loud,
// so a cycle THROWS rather than silently misorders.

// In-batch blockers of a story, by trailing slug. blocked_by entries may be bare
// slugs or "<epic>/<slug>" references; a story cannot block itself; blockers
// outside the batch are the orchestrator's concern. (Named distinctly from the
// script's own inBatchBlockers so the two coexist when inlined together.)
function inBatchBlockersOf(story, batchSlugs) {
  return (story.blocked_by || [])
    .map(reference => reference.split('/').pop())
    .filter(slug => slug !== story.slug && batchSlugs.has(slug))
}

function topologicalOrder(stories) {
  const batchSlugs = new Set(stories.map(story => story.slug))
  const blockersBySlug = new Map(
    stories.map(story => [story.slug, inBatchBlockersOf(story, batchSlugs)]),
  )

  const emitted = new Set()
  const order = []
  while (order.length < stories.length) {
    // Stable: among ready stories, take the earliest in the original array.
    const next = stories.find(
      story =>
        !emitted.has(story.slug) &&
        blockersBySlug.get(story.slug).every(blocker => emitted.has(blocker)),
    )
    if (!next) {
      const remaining = stories.filter(story => !emitted.has(story.slug)).map(story => story.slug)
      throw new Error(
        `topologicalOrder: dependency cycle among in-batch stories [${remaining.join(', ')}].`,
      )
    }
    emitted.add(next.slug)
    order.push(next)
  }
  return order
}
// <<< END inlined from _shared/topological_order.mjs <<<

// >>> BEGIN inlined from _shared/reset_worktree.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// reset_worktree — the dependency-preserving between-story reset for
// serial-in-tree execution. Canonical source of truth; resetWorktreeCommands is
// inlined into sprint_pipeline.js and rendered into the reset agent's prompt
// (the runtime has no child_process — ADR-0006). resetWorktree is
// execGit-injected for the unit tests, which drive it against real git in temp
// dirs. Unit-tested by reset_worktree.test.mjs (E4).
//
// Order matters and is EXACT:
//   1. `git reset --hard`               — discard conflicting uncommitted tracked
//                                          changes a failed/aborted Implement left,
//                                          so the checkout below cannot abort on a
//                                          dirty tree.
//   2. `git checkout -f <releaseBranch>`— return to the release branch.
//   3. `git clean -fd -e node_modules -e '**/node_modules'`
//                                        — remove the untracked, NON-IGNORED files
//                                          a story left behind. Deliberately NO -x.
//                                          Without -x, git clean never touches a
//                                          gitignored path, so everything ignored
//                                          survives the reset untouched: node_modules
//                                          (the deps serial-in-tree exists to reuse),
//                                          the skill's own `.claude` install dir, the
//                                          orchestration's `.claude-scrum-skill`
//                                          state, and any `.env*` secrets. -x is
//                                          FORBIDDEN here — its blast radius is EVERY
//                                          ignored path, which silently and
//                                          unrecoverably destroys all of the above.
//                                          The node_modules excludes are NOT redundant
//                                          under -fd: they guard the rare repo that
//                                          leaves node_modules untracked AND
//                                          un-ignored, where a bare -fd would delete
//                                          it. (`**/node_modules` is itself redundant
//                                          with the no-slash `node_modules` exclude,
//                                          which already matches at any depth, but is
//                                          kept as harmless belt-and-suspenders.)

function resetWorktreeCommands(releaseBranch) {
  return [
    ['reset', '--hard'],
    ['checkout', '-f', releaseBranch],
    ['clean', '-fd', '-e', 'node_modules', '-e', '**/node_modules'],
  ]
}

// execGit(args: string[]) => stdout; throws on failure. Runs the commands in
// order against repoRoot. Used by the unit tests; in the workflow the same
// command list is handed to an agent (no in-runtime child_process).
function resetWorktree(repoRoot, releaseBranch, execGit) {
  for (const args of resetWorktreeCommands(releaseBranch)) {
    execGit(['-C', repoRoot, ...args])
  }
}
// <<< END inlined from _shared/reset_worktree.mjs <<<

// >>> BEGIN inlined from _shared/run_sequential.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// run_sequential — the serial-in-tree driver. Canonical source of truth; inlined
// into sprint_pipeline.js. Pure control flow over injected callbacks and
// unit-tested by run_sequential.test.mjs (E5).
//
// Runs exactly ONE story chain in flight: it awaits each story's full
// implement→review→verify→merge chain (runChain) before starting the next, and
// runs resetBetween BETWEEN adjacent stories only — after story N's chain
// settles and before story N+1's, never after the last. It consumes an order
// already sorted topologically (topological_order.mjs), so a dependent's blocker
// has always finished before the dependent starts; there is therefore NO lock —
// a lock ahead of the dependency-await would recreate the R2 deadlock. Zero
// concurrency dissolves both the shared-HEAD race (R1) and the lock (R2).

async function runSequential(orderedStories, { runChain, resetBetween }) {
  const results = []
  for (let index = 0; index < orderedStories.length; index++) {
    if (index > 0 && resetBetween) {
      await resetBetween(orderedStories[index - 1], orderedStories[index])
    }
    results.push(await runChain(orderedStories[index], index))
  }
  return results
}
// <<< END inlined from _shared/run_sequential.mjs <<<

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
  // Optional isolation override (F9b): 'auto' | 'worktree' | 'serial-in-tree'.
  // 'auto' detects from node_modules tracking; existing callers omit it.
  isolationStrategy = 'auto',
} = normalizeArgs(args, 'sprint_pipeline')

if (!stories || stories.length === 0) {
  log('No stories in sprint — exiting.')
  return []
}

log(`Sprint pipeline: ${stories.length} stories on release branch ${releaseBranch} (backend=${backendMode}).`)

const NODE_MODULES_PROBE_SCHEMA = {
  type: 'object',
  required: ['stdout', 'errored'],
  properties: {
    stdout: { type: 'string' },
    errored: { type: 'boolean' },
  },
}

const RESET_RETURN_SCHEMA = {
  type: 'object',
  required: ['done'],
  properties: {
    done: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

// Detect whether node_modules is tracked. The runtime has no child_process
// (ADR-0006), so the `git ls-files node_modules` run is delegated to an agent;
// the pure classifyIsolationStrategy (inlined above) turns its output into a
// strategy. A failed probe is treated as a command error → the safe default.
async function probeNodeModulesTracking() {
  phase('Detect')
  const probe = await agent(
    `Report whether \`node_modules\` is tracked by git in this repository — a fresh \`git worktree add\` materializes tracked files only, so this decides the isolation strategy.

Run \`git ls-files node_modules\` at the repository root. Return:
  - stdout: the command's stdout verbatim (empty string if it printed nothing)
  - errored: true ONLY if git could not run at all (e.g. not a git repository); false otherwise, including the normal empty-output case.

Do NOT create, modify, or delete anything.`,
    { label: 'detect-layout', phase: 'Detect', schema: NODE_MODULES_PROBE_SCHEMA },
  )
  return probe || { stdout: '', errored: true }
}

// Resolve one strategy for the whole batch (F5): honor a concrete override,
// else auto-detect; log the evidence and source (F10); warn on the
// forced-worktree-over-untracked-deps foot-gun (F9b).
async function resolveIsolationStrategy() {
  const probe = await probeNodeModulesTracking()
  const detected = classifyIsolationStrategy(probe.stdout, probe.errored)
  const evidence = probe.errored
    ? 'command-error'
    : String(probe.stdout).trim()
      ? 'non-empty'
      : 'empty'

  if (isolationStrategy === 'worktree' || isolationStrategy === 'serial-in-tree') {
    if (isolationStrategy === 'worktree' && detected === 'serial-in-tree') {
      log(
        `WARNING: isolationStrategy override forces 'worktree' but node_modules appears untracked ` +
          `(git ls-files node_modules: ${evidence}). Dependencies must already exist in each fresh ` +
          `worktree or builds will fail. Proceeding as instructed.`,
      )
    }
    log(`Isolation strategy: ${isolationStrategy} (source=override, git ls-files node_modules: ${evidence}).`)
    return isolationStrategy
  }

  log(`Isolation strategy: ${detected} (source=auto, git ls-files node_modules: ${evidence}).`)
  return detected
}

const resolvedIsolation = await resolveIsolationStrategy()

function buildImplementPrompt(story, isolation) {
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
  const branchStrategyLine =
    isolation === 'worktree'
      ? `**Branch strategy:** You are in an isolated git worktree — work only here; do not touch other branches. Create branch \`story/${story.slug}\` from the latest \`${releaseBranch}\` (\`git checkout -b story/${story.slug} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. Implement. Commit with a clear message. Return the branch name, the commit SHAs, and any notes.`
      : `**Branch strategy:** You are working in the SHARED repository working tree — there is no worktree isolation, and stories run one at a time (serial-in-tree). Create branch \`story/${story.slug}\` from the latest \`${releaseBranch}\` and check it out here (\`git checkout -b story/${story.slug} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. Implement. Commit with a clear message. Return the branch name, the commit SHAs, and any notes.`
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

${branchStrategyLine}

Do NOT open a PR yet. Do NOT merge. The next stage handles review.`
}

// This is the only review pass over a story's diff, so the security focus the
// cleanup-time review panel used to contribute is folded into it here.
function buildReviewPrompt(impl, story) {
  return `You are reviewing the implementation of story ${story.slug} on branch ${impl.branch}.

Read the diff between ${releaseBranch} and ${impl.branch} with \`git diff ${releaseBranch}...${impl.branch}\` — do NOT check out either branch (review compares refs only; checking out would disturb the working tree the next stage merges on).

Story acceptance criteria:
${(story.acceptance_criteria || []).map(c => `  - ${c}`).join('\n')}

Review for: correctness against acceptance criteria, security, project convention compliance (per CLAUDE.md${baselinePath ? ` and the engineering baseline at ${baselinePath}` : ''}), and obvious defects. On security, look for injection sinks (SQL, shell, HTML, path), missing authentication, broken authorization, secret exposure, unvalidated input reaching dangerous APIs, and permission expansion without justification. ${baselinePath ? 'Confirm the baseline was honored: tests accompany the code and the design is the simplest that satisfies the story (no unearned abstraction). ' : ''}Do NOT bikeshed style the project doesn't enforce.

Return a ReviewVerdict: recommendation (accept | accept-with-followups | block), findings grouped by severity, and a one-paragraph summary.`
}

function buildVerifyPrompt(review, story, isolation) {
  const treeLine =
    isolation === 'worktree'
      ? `You are in an isolated git worktree — check out \`story/${story.slug}\` here (\`git checkout story/${story.slug}\`) so any build artifacts stay off the shared working tree.`
      : `You are in the SHARED working tree (serial-in-tree; one story at a time). Check out \`story/${story.slug}\` here (\`git checkout story/${story.slug}\`); the pipeline resets the tree (tracked changes reverted, untracked non-ignored cruft cleared) before the next story.`
  return `You are running a lightweight verification on story ${story.slug}.

${treeLine} If the project has a build/lint/test command, run it on the story branch. If not, perform a smoke read of the changed files to confirm no obvious runtime defects (broken imports, syntax errors, dangling references).

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

// Render a git command (arg array) as a shell line, quoting args that contain
// glob/whitespace so the reset agent runs them verbatim.
function renderGitCommand(args) {
  return 'git ' + args.map(arg => (/[*?\s]/.test(arg) ? `'${arg}'` : arg)).join(' ')
}

// The dependency-preserving between-story reset, delegated to an agent (no
// in-runtime child_process). The command list is the single source of truth
// (reset_worktree.mjs, inlined) so the order and excludes cannot drift.
function buildResetPrompt(prevStory, nextStory) {
  const commands = resetWorktreeCommands(releaseBranch).map(renderGitCommand)
  return `Serial-in-tree reset: story ${prevStory.slug} has merged; prepare the SHARED working tree for ${nextStory.slug}.

Run these commands at the repository root, in EXACTLY this order (the order matters — \`reset --hard\` first discards any conflicting uncommitted changes so the checkout cannot abort):
${commands.map(command => `  ${command}`).join('\n')}

This reverts tracked changes and removes untracked, non-ignored cruft while PRESERVING everything gitignored — node_modules (root and nested), the \`.claude\` install dir, the \`.claude-scrum-skill\` orchestration state, and any \`.env*\` secrets. Run the commands EXACTLY as given: never add \`-x\` (a bare \`git clean -fdx\` would delete every ignored path, destroying all of the above) and never substitute your own clean flags. Return { done: true } when the tree is clean.`
}

phase('Implement')
phase('Review')
phase('Verify')
phase('Reset')
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

async function runStory(story, isolation) {
  const blockers = inBatchBlockers(story)
  if (blockers.length) {
    const outcomes = await Promise.all(blockers.map(slug => terminal.get(slug)))
    const unmet = blockers.filter((_, index) => outcomes[index]?.status !== 'done')
    if (unmet.length) {
      log(`Skipping ${story.slug}: upstream ${unmet.join(', ')} did not complete.`)
      return dependencyBlocked(story, unmet)
    }
  }

  // Worktree mode isolates each Implement/Verify in its own tree; serial-in-tree
  // omits isolation and runs on the shared tree (one story at a time).
  const agentIsolation = isolation === 'worktree' ? { isolation: 'worktree' } : {}

  const impl = await agent(buildImplementPrompt(story, isolation), {
    label: `impl:${story.slug}`,
    phase: 'Implement',
    schema: IMPL_RETURN_SCHEMA,
    ...agentIsolation,
  })
  if (!impl) return null

  const review = await agent(buildReviewPrompt(impl, story), {
    label: `review:${story.slug}`,
    phase: 'Review',
    schema: REVIEW_VERDICT_SCHEMA,
  })
  if (!review) return null
  if (review.recommendation === 'block') return reviewBlocked(story, impl, review)

  const verify = await agent(buildVerifyPrompt(review, story, isolation), {
    label: `verify:${story.slug}`,
    phase: 'Verify',
    schema: VERIFY_RETURN_SCHEMA,
    ...agentIsolation,
  })
  if (!verify) return null
  if (verify.verifyStatus === 'fail') return verifyBlocked(story, impl, verify)

  const finalize = () =>
    agent(buildOpenPRPrompt(verify, story, impl), {
      label: `pr:${story.slug}`,
      phase: 'Open PR',
      schema: SPRINT_STORY_RETURN_SCHEMA,
    })

  // GitHub mode opens independent PRs (no shared-tree mutation). Worktree mode
  // fans in concurrent local merges, so it serializes them behind a lock.
  // Serial-in-tree has zero concurrency — no lock (a lock would reintroduce the
  // R2 deadlock); the merge simply runs.
  if (backendMode === 'github') return finalize()
  if (isolation === 'serial-in-tree') return finalize()
  return serializeMerge(finalize)
}

// Isolate each chain: a thrown agent or stage becomes a 'failed' result rather
// than tearing down the whole batch. A failed (not 'done') outcome also
// correctly blocks any dependent.
function chainOutcome(story) {
  return runStory(story, resolvedIsolation).catch(error => {
    const detail = error?.message || String(error)
    log(`Story ${story.slug} errored: ${detail}`)
    return makeSprintStoryReturn({
      storySlug: story.slug,
      status: 'failed',
      reason: `Unhandled error: ${detail}`,
    })
  })
}

// The two execution models are chosen once (F5) and never mixed within a run.
if (resolvedIsolation === 'serial-in-tree') {
  // Serial-in-tree: exactly one story chain in flight, in genuine
  // dependency-topological order (never array order). Each story's terminal
  // outcome is recorded before the next starts, so a dependent's blocker await
  // at the top of runStory is always already-resolved — no stall, no deadlock.
  // The shared tree is reset between adjacent stories (never after the last).
  const ordered = topologicalOrder(stories)
  const results = await runSequential(ordered, {
    runChain: async story => {
      const result = await chainOutcome(story)
      terminal.set(story.slug, Promise.resolve(result))
      return result
    },
    resetBetween: (prevStory, nextStory) =>
      agent(buildResetPrompt(prevStory, nextStory), {
        label: `reset:${prevStory.slug}->${nextStory.slug}`,
        phase: 'Reset',
        schema: RESET_RETURN_SCHEMA,
      }),
  })
  return results.filter(Boolean)
}

// Worktree mode: stories run concurrently. Open the gate only after every
// terminal promise is registered, so a dependent's blocker lookup never races
// an unregistered entry.
let openGate
const gate = new Promise(resolve => {
  openGate = resolve
})
for (const story of stories) {
  terminal.set(story.slug, gate.then(() => chainOutcome(story)))
}
openGate()

const results = await Promise.all(stories.map(story => terminal.get(story.slug)))
return results.filter(Boolean)
