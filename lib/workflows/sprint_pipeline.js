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
//   situationalGuidance?: string[], // SKILL.md paths (design-patterns, domain-modeling) — core-domain epics only
//   sessionModel?: "haiku" | "sonnet" | "opus", // what this session runs at; omit and the tiers relative to it inherit
//   isolationStrategy?: "auto" | "worktree" | "serial-in-tree", // execution model; "auto" detects it
//   dependencyStrategy?: "assume-present" | "clone" | "install" | "symlink" // how a fresh worktree obtains node_modules
//                                          // (a story that touches package.json or a lockfile escalates clone → install)
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
    changedFiles: { type: 'array', items: { type: 'string' } },
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

// >>> BEGIN inlined from _shared/resolve_agent_tier.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// resolve_agent_tier — the single authoritative map from an agent stage, and
// the difficulty of the story it works on, to the (model, effort) tier it runs
// at. Canonical source of truth; the workflow scripts carry an inlined copy of
// this block (the runtime cannot import), kept in sync by inline_sync.test.mjs.
// Unit-tested by resolve_agent_tier.test.mjs.
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

// What a stage costs on its own character, before the story is known: verify
// runs a build/lint/test command and reports its status, which is not a
// judgment task, while elaborate reasons over a whole epic.
const STAGE_TIERS = {
  'detect-layout': { model: CHEAPEST, effort: 'low' },
  'implement': { model: SESSION, effort: SESSION },
  'review': { model: ONE_TIER_DOWN, effort: 'medium' },
  'verify': { model: CHEAPEST, effort: 'low' },
  'pr': { model: CHEAPEST, effort: 'low' },
  'reset': { model: CHEAPEST, effort: 'low' },
  'skeptic': { model: ONE_TIER_DOWN, effort: 'medium' },
  'judge': { model: ONE_TIER_DOWN, effort: 'medium' },
  'elaborate': { model: SESSION, effort: 'medium' },
}

// Difficulty bands over story points, on the Fibonacci scale stories are
// estimated with.
const SMALL = 'small' // 1–2
const MODERATE = 'moderate' // 3–5
const LARGE = 'large' // 8–13
const LARGEST_SMALL_STORY = 2
const LARGEST_MODERATE_STORY = 5

// Two kinds of story cut against cost entirely, for the reason verification
// that guards destructive operations survives everywhere else: ops stories are
// migrations, CI, secrets and IaC — "what if this runs twice" work — and a
// P0-critical story is one the sprint is stopped on. For both, blast radius
// beats cost, so no stage tiers down from the session model.
const NEVER_TIERING_DOWN_PERSONA = 'ops'
const NEVER_TIERING_DOWN_PRIORITY = 'P0-critical'

// The stages whose model target moves with how hard the story is. Every stage
// absent here costs the same whatever the story weighs.
//
// `implement` is deliberately absent, and that is a decision rather than an
// omission. It writes the artifact, so its output quality *is* the product's
// quality; and `points` is an estimate authored before anyone read the code, so
// tiering on it would stake the artifact on an estimate. It stays at the session
// model for every story, matching pre-tiering behaviour exactly. `review` may
// vary because a weak review is caught downstream by verify and the test suite —
// its misses are recoverable, an implementation's are not. Do not "simplify" by
// giving implement a difficulty row; see ADR-0007.
const DIFFICULTY_MODELS = {
  'review': { [SMALL]: CHEAPEST, [MODERATE]: ONE_TIER_DOWN, [LARGE]: ONE_TIER_DOWN },
}

function resolveAgentTier(stage, { sessionModel, story } = {}) {
  const tier = tierFor(stage, story)
  return { ...resolveModel(tier.model, sessionModel), ...resolveEffort(tier.effort) }
}

// The stage's tier, its model target swapped for the difficulty-adjusted one
// when the stage varies by difficulty and the story carries an estimate. The
// never-tier-down overrides are read first and skip the difficulty rules
// outright, so an ops 1-pointer implements at the session model rather than at
// the implement floor. adversarial_verify works findings rather than stories
// and supplies none, so an absent story falls back to pure stage tiering.
function tierFor(stage, story) {
  const tier = STAGE_TIERS[stage]
  if (!tier) {
    throw new Error(
      `resolveAgentTier: unknown stage '${stage}'. ` +
        `Known stages: ${Object.keys(STAGE_TIERS).join(', ')}.`,
    )
  }
  if (neverTiersDown(story)) return suppressTierDown(tier)
  const byDifficulty = DIFFICULTY_MODELS[stage]
  if (!byDifficulty || !isEstimated(story)) return tier
  return { ...tier, model: byDifficulty[difficultyOf(story.points)] }
}

function neverTiersDown(story) {
  if (story?.persona === NEVER_TIERING_DOWN_PERSONA) return true
  return story?.priority === NEVER_TIERING_DOWN_PRIORITY
}

// Only a target computed from the session's own model is a tier *down*; a stage
// pinned to an absolute model — the mechanical ones — never stepped down from
// the session, so an override has nothing to suppress there.
function suppressTierDown(tier) {
  return tier.model === ONE_TIER_DOWN ? { ...tier, model: SESSION } : tier
}

function isEstimated(story) {
  return typeof story?.points === 'number' && story.points > 0
}

function difficultyOf(points) {
  if (points <= LARGEST_SMALL_STORY) return SMALL
  if (points <= LARGEST_MODERATE_STORY) return MODERATE
  return LARGE
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

// >>> BEGIN inlined from _shared/resolve_dependency_strategy.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// resolve_dependency_strategy — how a fresh worktree obtains its dependency
// directory. Canonical source of truth; inlined into sprint_pipeline.js (the
// runtime cannot import), kept in sync by inline_sync.test.mjs. Pure and
// unit-tested by resolve_dependency_strategy.test.mjs.
//
// The four strategies vary along a known, closed axis, so they are a dispatch
// table over four small functions rather than a hierarchy. Each returns the
// instruction a fresh worktree is provisioned by — the runtime has no
// child_process (ADR-0006), so the commands are delegated to the agent working
// in that worktree, exactly as the between-story reset is — and the outcome
// line the batch is logged by.
//
//   assume-present  nothing; the worktree already carries its dependencies.
//                   The default, and today's behaviour exactly.
//   clone           copy-on-write clone from the main tree. On darwin/APFS
//                   `cp -c` is clonefile: metadata-only, measured at 5ms
//                   against 59ms for a real copy of a 200MB tree, and the gap
//                   widens on node_modules because a real copy pays per file.
//   install         the project's clean-install command — the only strategy
//                   that proves the tree matches the lockfile.
//   symlink         a link to the main tree's directory: free, but shared
//                   mutable state across concurrent stories.
//
// Two of the four refuse rather than degrade quietly. clone on a filesystem
// without copy-on-write support substitutes install and logs the substitution,
// because a real recursive copy of node_modules is the very cost clone exists
// to avoid. symlink throws on a batch carrying a dependency-touching story,
// because one story installing through the shared directory corrupts the
// stories running beside it, and a caller who asked for symlink and quietly got
// something else has wrong information about their run.
//
// The batch picks one strategy, but a story that changes dependencies needs the
// one that validates them, so escalateForStory raises clone to install for that
// story alone: clone speed for the stories that never touch dependencies, and
// clean-install validation where dependency correctness is at stake. A missing
// lockfile update then fails during the story instead of passing silently and
// breaking CI later. reconcileDependencyEscalation closes the loop afterwards
// against what the story actually changed, and reports a miss rather than
// re-provisioning over it — a silent correction hides a detection gap that will
// recur.

const ASSUME_PRESENT = 'assume-present'
const CLONE = 'clone'
const INSTALL = 'install'
const SYMLINK = 'symlink'

const DEPENDENCY_STRATEGIES = [ASSUME_PRESENT, CLONE, INSTALL, SYMLINK]

const DEPENDENCY_DIRECTORY = 'node_modules'

// The files a dependency change lands in, as a regex alternation — one list
// read two ways: as prose in a story's declared surface before it runs, and as
// paths in its diff after.
const DEPENDENCY_FILES = [
  'package\\.json',
  'package-lock\\.json',
  'pnpm-lock\\.yaml',
  'yarn\\.lock',
  'bun\\.lockb?',
].join('|')

// A story naming one of the files in its declared surface is the story symlink
// refuses to share a directory with and the story clone escalates for; the word
// "lockfile" counts, because a story that says it updates the lockfile has
// declared the same surface as one that names the file.
const DEPENDENCY_FILE_MENTION = new RegExp(`${DEPENDENCY_FILES}|lock-?file`, 'i')

// A changed path is the same knowledge read literally: anchored to a whole path
// segment, so `fixtures/my-package.json` is not a dependency change, and prose
// like "lockfile" has no meaning at all.
const DEPENDENCY_FILE_PATH = new RegExp(`(^|/)(${DEPENDENCY_FILES})$`)

// The strategies that hand a worktree a dependency directory nobody checked
// against the lockfile, and so the ones a story's diff is reconciled against.
// install checked it, and assume-present provisioned nothing to check.
const PROVISIONS_WITHOUT_VALIDATING = [CLONE, SYMLINK]

const PROVISIONERS = {
  [ASSUME_PRESENT]: assumePresent,
  [CLONE]: cloneFromMainTree,
  [INSTALL]: cleanInstall,
  [SYMLINK]: linkToMainTree,
}

// Resolves to { strategy, instruction, outcome }: the strategy in force, the
// provisioning instruction for a fresh worktree (empty when the strategy
// provisions nothing), and the line the batch logs it by. The strategy in force
// is the one requested unless a provisioner substituted another for it, in
// which case it reports the substitute and the outcome says so. Throws when the
// strategy is unknown, its precondition does not hold, or the batch makes it
// unsafe.
function resolveDependencyStrategy(requestedStrategy = ASSUME_PRESENT, context = {}) {
  const provision = PROVISIONERS[requestedStrategy]
  if (!provision) {
    throw new Error(
      `resolveDependencyStrategy: unknown dependency strategy '${requestedStrategy}'. ` +
        `Known strategies: ${DEPENDENCY_STRATEGIES.join(', ')}.`,
    )
  }
  return { strategy: requestedStrategy, ...provision(context) }
}

function assumePresent() {
  return {
    instruction: '',
    outcome:
      `Dependency strategy: assume-present — no provisioning; ` +
      `every worktree is expected to already carry ${DEPENDENCY_DIRECTORY}.`,
  }
}

function cloneFromMainTree({ mainTreePath, copyOnWriteSupported }) {
  if (copyOnWriteSupported === false) return substituteInstallForClone()

  const source = mainTreeDependencyDirectory(mainTreePath, CLONE)
  return {
    instruction:
      `**Dependencies:** this worktree has no ${DEPENDENCY_DIRECTORY} yet. Before you build, test, or ` +
      `lint here, copy-on-write clone it from the main working tree: run ` +
      `\`cp -c -R "${source}" ${DEPENDENCY_DIRECTORY}\` at the root of this worktree. \`-c\` is the ` +
      `APFS clonefile flag — the clone is metadata-only, so it costs milliseconds, and it diverges ` +
      `from the main tree the moment either side writes. If the filesystem cannot clone and the ` +
      `command fails, run the project's clean-install command instead and say so in your notes — a ` +
      `plain recursive copy of ${DEPENDENCY_DIRECTORY} is the cost this strategy exists to avoid.`,
    outcome: `Dependency strategy: clone — every worktree copy-on-write clones ${source}.`,
  }
}

// A filesystem the batch has established has no copy-on-write support cannot
// clone at all, so the substitution is settled here rather than left to fail in
// each worktree. install is the substitute because it is the only other
// strategy that leaves a worktree its own isolated directory. A filesystem
// nobody probed is not one known to lack cloning, so it still clones — the
// instruction above carries the refusal for the case discovered at runtime.
function substituteInstallForClone() {
  return {
    strategy: INSTALL,
    instruction: cleanInstall().instruction,
    outcome:
      `Dependency strategy: install — substituted for clone, which this filesystem has no ` +
      `copy-on-write support for; a real recursive copy of ${DEPENDENCY_DIRECTORY} is the cost ` +
      `clone exists to avoid, so it is not offered as the fallback.`,
  }
}

function cleanInstall() {
  return {
    instruction:
      `**Dependencies:** this worktree has no ${DEPENDENCY_DIRECTORY} yet. Before you build, test, or ` +
      `lint here, run the project's clean-install command — the one that installs from the lockfile ` +
      `exactly, without updating it — at the root of this worktree. If it fails because the lockfile ` +
      `does not match the manifest, that failure belongs to the story and is to be fixed, not worked ` +
      `around.`,
    outcome: `Dependency strategy: install — every worktree runs the project's clean-install command.`,
  }
}

function linkToMainTree({ mainTreePath, stories = [] }) {
  refuseDependencyTouchingBatch(stories)
  const target = mainTreeDependencyDirectory(mainTreePath, SYMLINK)
  return {
    instruction:
      `**Dependencies:** this worktree has no ${DEPENDENCY_DIRECTORY} yet. Before you build, test, or ` +
      `lint here, link it to the main working tree's: run ` +
      `\`ln -s "${target}" ${DEPENDENCY_DIRECTORY}\` at the root of this ` +
      `worktree. The link is shared mutable state that concurrent stories read through — do not install, ` +
      `add, or remove packages through it.`,
    outcome: `Dependency strategy: symlink — every worktree's ${DEPENDENCY_DIRECTORY} links to ${target}.`,
  }
}

// Every worktree reads and writes one directory under symlink, so a story that
// installs, adds, or removes a package corrupts the stories running beside it.
// The batch is refused, and named — it is the caller's to resolve by choosing
// clone or install, because a symlink run that quietly became something else
// would report an isolation it never had.
function refuseDependencyTouchingBatch(stories) {
  const offender = stories.find(touchesDependencyFiles)
  if (offender) {
    throw new Error(
      `resolveDependencyStrategy: '${SYMLINK}' shares one ${DEPENDENCY_DIRECTORY} across every ` +
        `worktree, and story '${offender.slug}' is identified as touching package.json or a ` +
        `lockfile. Ask for '${CLONE}' or '${INSTALL}' instead.`,
    )
  }
}

// The batch's provisioning as it applies to one story, escalated to install
// when that story's declared surface names package.json or a lockfile, so the
// story that changes dependencies is the story whose tree is proven against the
// lockfile. Escalation is from clone alone: assume-present is a caller's stated
// intent to provision nothing, install already validates, and symlink refuses
// such a batch outright. Runs before the story, so the escalation is settled by
// the time the worktree is provisioned.
function escalateForStory(batchProvisioning, story) {
  if (batchProvisioning.strategy !== CLONE || !touchesDependencyFiles(story)) return batchProvisioning
  return escalatedInstall(story)
}

function escalatedInstall(story) {
  return {
    strategy: INSTALL,
    instruction: cleanInstall().instruction,
    outcome:
      `Dependency strategy: install for story '${story.slug}' — escalated from ${CLONE} because the ` +
      `story's declared surface names package.json or a lockfile. A clean install is the only ` +
      `strategy a missing lockfile update fails under, and it fails during the story rather than in CI.`,
  }
}

// What the story changed, read back against the strategy it ran under: a diff
// that touched a dependency file under a strategy that provisioned the
// directory without validating it is a story the escalation check should have
// caught and did not. Returns the report line, or '' when there is nothing to
// report. symlink is reconciled alongside clone because the miss is the same
// one — a story whose declared surface said nothing — and it is most dangerous
// where every worktree shares one directory.
//
// The report is the deliverable. Re-provisioning here would leave the detection
// gap in place to recur on the next story that words its surface the same way.
function reconcileDependencyEscalation({ story, strategy, changedFiles = [] }) {
  if (!PROVISIONS_WITHOUT_VALIDATING.includes(strategy)) return ''

  const touched = changedFiles.filter(changedFile => DEPENDENCY_FILE_PATH.test(changedFile))
  if (touched.length === 0) return ''

  return (
    `Dependency escalation mismatch: story '${story.slug}' changed ${touched.join(', ')} but ran ` +
    `under '${strategy}', so nothing proved its tree matches the lockfile. Reported, not corrected — ` +
    `the story's declared surface named no dependency file, and re-provisioning now would hide that ` +
    `detection gap rather than close it.`
  )
}

// A story's declared surface — the acceptance criteria and technical context it
// was scheduled on — is what identifies it before it runs.
function touchesDependencyFiles(story) {
  const declaredSurface = [...(story.acceptance_criteria || []), story.technical_context || ''].join('\n')
  return DEPENDENCY_FILE_MENTION.test(declaredSurface)
}

// The main tree's dependency directory, which clone and symlink both name and
// install never does. Their shared precondition is therefore knowing where the
// main tree is: a probe that could not answer leaves the path absent, and a
// strategy built on a path nobody resolved would clone from, or link to, the
// wrong place.
function mainTreeDependencyDirectory(mainTreePath, strategy) {
  if (!mainTreePath) {
    throw new Error(
      `resolveDependencyStrategy: '${strategy}' provisions ${DEPENDENCY_DIRECTORY} from the ` +
        `main working tree, whose path was not resolved.`,
    )
  }
  return `${mainTreePath}/${DEPENDENCY_DIRECTORY}`
}
// <<< END inlined from _shared/resolve_dependency_strategy.mjs <<<

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
  sessionModel,
  // Optional isolation override (F9b): 'auto' | 'worktree' | 'serial-in-tree'.
  // 'auto' detects from node_modules tracking; existing callers omit it.
  isolationStrategy = 'auto',
  // How a fresh worktree obtains node_modules: 'assume-present' | 'clone' |
  // 'install' | 'symlink'. The default provisions nothing, which is today's
  // behaviour exactly; existing callers omit it.
  dependencyStrategy = ASSUME_PRESENT,
} = normalizeArgs(args, 'sprint_pipeline')

if (!stories || stories.length === 0) {
  log('No stories in sprint — exiting.')
  return []
}

log(`Sprint pipeline: ${stories.length} stories on release branch ${releaseBranch} (backend=${backendMode}).`)

const REPO_LAYOUT_PROBE_SCHEMA = {
  type: 'object',
  required: ['stdout', 'mainTreePath', 'errored'],
  properties: {
    stdout: { type: 'string' },
    mainTreePath: { type: 'string' },
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

// Probe the two facts the batch's execution model rests on: whether
// node_modules is tracked, and where the main working tree is. The runtime has
// no child_process (ADR-0006), so the git runs are delegated to an agent; the
// pure resolvers (inlined above) turn the answers into strategies. A failed
// probe is treated as a command error → the safe default.
async function probeRepoLayout() {
  phase('Detect')
  const probe = await agent(
    `Report two facts about this repository. A fresh \`git worktree add\` materializes tracked files only, so together they decide how the sprint's stories are executed.

Run \`git ls-files node_modules\` and \`git rev-parse --show-toplevel\` at the repository root. Return:
  - stdout: the stdout of \`git ls-files node_modules\` verbatim (empty string if it printed nothing)
  - mainTreePath: the absolute path \`git rev-parse --show-toplevel\` printed (empty string if it printed nothing)
  - errored: true ONLY if git could not run at all (e.g. not a git repository); false otherwise, including the normal empty-output case.

Do NOT create, modify, or delete anything.`,
    {
      label: 'detect-layout',
      phase: 'Detect',
      schema: REPO_LAYOUT_PROBE_SCHEMA,
      ...resolveAgentTier('detect-layout', { sessionModel }),
    },
  )
  return probe || { stdout: '', mainTreePath: '', errored: true }
}

// Resolve one strategy for the whole batch (F5): honor a concrete override,
// else auto-detect; log the evidence and source (F10); warn on the
// forced-worktree-over-untracked-deps foot-gun (F9b).
function resolveIsolationStrategy(probe) {
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

const repoLayout = await probeRepoLayout()
const resolvedIsolation = resolveIsolationStrategy(repoLayout)

// One dependency strategy for the whole batch, from the same probe. It fills
// FRESH worktrees only: serial-in-tree runs every story in the shared working
// tree, which already carries its dependencies — provisioning over them there
// would overwrite the very directory the strategy exists to reuse — so the
// instruction is withheld and the skip is logged rather than passing silently.
// The batch's stories go in with it: symlink shares one node_modules across
// every worktree, so it refuses a batch carrying a dependency-touching story.
const dependencyProvisioning = resolveDependencyStrategy(dependencyStrategy, {
  mainTreePath: repoLayout.mainTreePath,
  stories,
})
log(dependencyProvisioning.outcome)
if (resolvedIsolation === SERIAL_IN_TREE && dependencyProvisioning.strategy !== ASSUME_PRESENT) {
  log(
    `Dependency strategy: ${dependencyProvisioning.strategy} is not applied under serial-in-tree — ` +
      `every story runs in the shared working tree, which already carries its dependencies.`,
  )
}
// The provisioning each story is actually run under. Serial-in-tree provisions
// nothing, so it resolves to assume-present and nothing escalates there either;
// in worktree mode a story whose declared surface names package.json or a
// lockfile is escalated to the validating install. Detection runs here, where
// the batch is assembled, so every escalation is settled and logged before the
// first story starts.
const appliedProvisioning =
  resolvedIsolation === WORKTREE ? dependencyProvisioning : resolveDependencyStrategy(ASSUME_PRESENT)
const storyProvisioning = new Map(
  stories.map(story => [story.slug, escalateForStory(appliedProvisioning, story)]),
)
for (const provisioning of storyProvisioning.values()) {
  if (provisioning.strategy !== appliedProvisioning.strategy) log(provisioning.outcome)
}

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
  // The changed files are what the post-hoc escalation reconciliation reads, so
  // they are asked for from the agent that already has the branch in hand.
  const returnLine = `Implement. Commit with a clear message. Return the branch name, the commit SHAs, the files the story changed (\`git diff --name-only ${releaseBranch}...story/${story.slug}\`), and any notes.`
  const branchStrategyLine =
    isolation === 'worktree'
      ? `**Branch strategy:** You are in an isolated git worktree — work only here; do not touch other branches. Create branch \`story/${story.slug}\` from the latest \`${releaseBranch}\` (\`git checkout -b story/${story.slug} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. ${returnLine}`
      : `**Branch strategy:** You are working in the SHARED repository working tree — there is no worktree isolation, and stories run one at a time (serial-in-tree). Create branch \`story/${story.slug}\` from the latest \`${releaseBranch}\` and check it out here (\`git checkout -b story/${story.slug} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. ${returnLine}`
  const dependencyInstruction = storyProvisioning.get(story.slug).instruction
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

${dependencyInstruction}

Do NOT open a PR yet. Do NOT merge. The next stage handles review.`
}

// This is the only review pass over a story's diff, so the security focus the
// cleanup-time review panel used to contribute is folded into it here.
function buildReviewPrompt(impl, story) {
  return `You are reviewing the implementation of story ${story.slug} on branch ${impl.branch}.

Read the diff between ${releaseBranch} and ${impl.branch} with \`git diff ${releaseBranch}...${impl.branch}\` — do NOT check out either branch (review compares refs only; checking out would disturb the working tree the next stage merges on).

Story acceptance criteria:
${(story.acceptance_criteria || []).map(c => `  - ${c}`).join('\n')}

Review for: correctness against acceptance criteria, security, project convention compliance (per CLAUDE.md${baselinePath ? ` and the engineering baseline at ${baselinePath}` : ''}), and obvious defects. On security, look for injection sinks (SQL, shell, HTML, path), missing authentication, broken authorization, secret exposure, unvalidated input reaching dangerous APIs, and permission expansion without justification. Do NOT bikeshed style the project doesn't enforce.

Return a ReviewVerdict: recommendation (accept | accept-with-followups | block), findings grouped by severity, and a one-paragraph summary.`
}

function buildVerifyPrompt(review, story, isolation) {
  const dependencyInstruction = storyProvisioning.get(story.slug).instruction
  const treeLine =
    isolation === 'worktree'
      ? `You are in an isolated git worktree — check out \`story/${story.slug}\` here (\`git checkout story/${story.slug}\`) so any build artifacts stay off the shared working tree.`
      : `You are in the SHARED working tree (serial-in-tree; one story at a time). Check out \`story/${story.slug}\` here (\`git checkout story/${story.slug}\`); the pipeline resets the tree (tracked changes reverted, untracked non-ignored cruft cleared) before the next story.`
  return `You are running a lightweight verification on story ${story.slug}.

${treeLine}

${dependencyInstruction}

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

// The escalation decision was made before the story, from its declared surface;
// this reads the story's diff back against the strategy it ran under. A miss is
// logged and the story carries on — re-provisioning it here would hide the
// detection gap that let the story through in the first place.
function reportDependencyEscalationMismatch(story, impl) {
  const mismatch = reconcileDependencyEscalation({
    story,
    strategy: storyProvisioning.get(story.slug).strategy,
    changedFiles: impl.changedFiles,
  })
  if (mismatch) log(mismatch)
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
    ...resolveAgentTier('implement', { sessionModel, story }),
  })
  if (!impl) return null
  reportDependencyEscalationMismatch(story, impl)

  const review = await agent(buildReviewPrompt(impl, story), {
    label: `review:${story.slug}`,
    phase: 'Review',
    schema: REVIEW_VERDICT_SCHEMA,
    ...resolveAgentTier('review', { sessionModel, story }),
  })
  if (!review) return null
  if (review.recommendation === 'block') return reviewBlocked(story, impl, review)

  const verify = await agent(buildVerifyPrompt(review, story, isolation), {
    label: `verify:${story.slug}`,
    phase: 'Verify',
    schema: VERIFY_RETURN_SCHEMA,
    ...agentIsolation,
    ...resolveAgentTier('verify', { sessionModel, story }),
  })
  if (!verify) return null
  if (verify.verifyStatus === 'fail') return verifyBlocked(story, impl, verify)

  const finalize = () =>
    agent(buildOpenPRPrompt(verify, story, impl), {
      label: `pr:${story.slug}`,
      phase: 'Open PR',
      schema: SPRINT_STORY_RETURN_SCHEMA,
      ...resolveAgentTier('pr', { sessionModel }),
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
        ...resolveAgentTier('reset', { sessionModel }),
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
