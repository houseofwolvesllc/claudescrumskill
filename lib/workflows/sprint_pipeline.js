// sprint_pipeline.js — per-story sprint execution.
//
// Invoked by /project-orchestrate Phase 1 Step 3. Each story runs its own
// independent chain — implement → review → verify → open PR — with no
// per-stage barriers, and concurrency bounded by the host's free disk as well
// as its cores (resolve_worktree_concurrency), never above the Workflow tool's
// own cap of min(16, cpu_cores - 2). Which of the two bounds held the run is
// logged with the batch's other resolutions.
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
//   epicSlug: string,              // namespaces story branches: story/<epicSlug>/<story-slug>
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
//                                          // (omitted, it is chosen from the repo's lockfile and layout; a story that
//                                          //  touches package.json or a lockfile escalates clone → install)
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
    // What the provisioning command reported when the worktree could not obtain
    // node_modules at all. Present only on that failure, and it is what separates
    // a tree that never ran the story from a story whose code did not work.
    dependencySetupFailure: { type: 'string' },
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
    status: { type: 'string', enum: ['done', 'blocked', 'failed', 'infrastructure-failed'] },
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
// detect_repo_layout — pick the isolation strategy from whether a fresh
// worktree can obtain its dependencies. Canonical source of truth; the pure
// classifier is inlined into sprint_pipeline.js (the runtime cannot import),
// fed the stdout of `git ls-files node_modules` obtained via an agent (the
// runtime has no child_process — ADR-0006). detectIsolationStrategy is
// execGit-injected and exists only for the unit tests, which drive it against
// real git in temp dirs. Unit-tested by detect_repo_layout.test.mjs (E2).
//
// The gate asks whether this worktree can GET dependencies, not whether they
// are already tracked. A fresh `git worktree add` materializes tracked files
// only, so a tracked node_modules rides in with the worktree — but an untracked
// one is obtainable too, by any provisioning strategy whose preconditions hold
// here (resolve_dependency_strategy owns which those are, and hands the list
// in). Only a repo where nothing can fill an empty worktree is reduced to
// running its stories one at a time, which is why almost every repo used to be:
// almost nobody vendors node_modules.

const WORKTREE = 'worktree'
const SERIAL_IN_TREE = 'serial-in-tree'

// Pure. `git ls-files node_modules` prints the tracked paths and exits 0 with
// no output when there are none — there is no exit-1 "no" case, so the stdout
// is the whole answer.
function dependenciesAreTracked(lsFilesStdout) {
  return String(lsFilesStdout ?? '').trim().length > 0
}

// Pure. Tracked dependencies arrive with a fresh worktree and an untracked
// node_modules is provisioned into one by any viable strategy, so either
// answers the gate. No viable strategy over untracked dependencies leaves every
// fresh worktree dependency-empty → serial-in-tree, and so does a command error
// (non-git dir, git exit 128, or any invocation failure): a repository git
// cannot read is one nobody can add a worktree to.
function classifyIsolationStrategy(lsFilesStdout, commandErrored, viableProvisioning = []) {
  if (commandErrored) return SERIAL_IN_TREE
  if (dependenciesAreTracked(lsFilesStdout)) return WORKTREE
  return viableProvisioning.length > 0 ? WORKTREE : SERIAL_IN_TREE
}

// execGit(args: string[]) => stdout string, throwing on command failure. The
// command-error case is caught here and mapped to the safe default, so a
// detector failure NEVER kills the batch (F9a).
function detectIsolationStrategy(repoRoot, execGit, viableProvisioning = []) {
  try {
    const stdout = execGit(['-C', repoRoot, 'ls-files', 'node_modules'])
    return classifyIsolationStrategy(stdout, false, viableProvisioning)
  } catch {
    return classifyIsolationStrategy('', true, viableProvisioning)
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
//
// Before a strategy is resolved it is chosen, and viableProvisioningStrategies
// is where: the lockfile at the repository root names the package manager, and
// that plus where the main tree is and whether the filesystem can clone says
// which strategies could fill a fresh, dependency-empty worktree here at all.
// That list is what the isolation gate reads to answer "can this worktree GET
// dependencies?", and its first entry is what a caller who named no strategy
// runs under.

const ASSUME_PRESENT = 'assume-present'
const CLONE = 'clone'
const INSTALL = 'install'
const SYMLINK = 'symlink'

const DEPENDENCY_STRATEGIES = [ASSUME_PRESENT, CLONE, INSTALL, SYMLINK]

const NPM = 'npm'
const PNPM = 'pnpm'
const YARN = 'yarn'
const BUN = 'bun'

const NO_PACKAGE_MANAGER = ''

const DEPENDENCY_DIRECTORY = 'node_modules'

// The lockfile each package manager writes, in the precedence a repo carrying
// more than one is read by. Every alternative to npm declares itself
// unambiguously, while package-lock.json is the file a migration away from npm
// leaves behind, so it answers last rather than first.
const LOCKFILES = [
  { packageManager: PNPM, lockfiles: ['pnpm-lock.yaml'] },
  { packageManager: YARN, lockfiles: ['yarn.lock'] },
  { packageManager: BUN, lockfiles: ['bun.lockb', 'bun.lock'] },
  { packageManager: NPM, lockfiles: ['package-lock.json'] },
]

// The files a dependency change lands in, as a regex alternation over the same
// lockfile names — one list read three ways: as the manager a repo installs by,
// as prose in a story's declared surface before it runs, and as paths in its
// diff after.
const DEPENDENCY_FILES = ['package.json', ...LOCKFILES.flatMap(({ lockfiles }) => lockfiles)]
  .map(fileName => fileName.replace(/\./g, '\\.'))
  .join('|')

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

// The package manager a repo installs by, read from the lockfile at its root —
// the only artifact that names one without being asked. Returns '' when no
// lockfile is there: a repo with no clean-install command is not one to assume
// npm for, and the strategies that need one are simply not offered.
function detectPackageManager(rootFiles = []) {
  const identified = LOCKFILES.find(({ lockfiles }) => lockfiles.some(name => rootFiles.includes(name)))
  return identified ? identified.packageManager : NO_PACKAGE_MANAGER
}

// The strategies that can fill a fresh, dependency-empty worktree in this repo,
// in preference order. Empty means nothing can, which is the one condition that
// reduces a batch to running its stories one at a time.
//
// clone leads on cost — a copy-on-write clone is metadata-only — except on
// pnpm, whose content-addressable store already makes a per-worktree install
// cheap, so the tradeoff clone exists to manage does not apply there and the
// validating strategy is simply better. Each is offered only where its
// precondition holds: clone from a main tree path a probe resolved, on a
// filesystem not known to lack copy-on-write; install from a lockfile that
// names a package manager. assume-present is absent because it provisions
// nothing, and symlink because one directory shared across concurrent worktrees
// is never chosen for a caller — it is asked for by name.
function viableProvisioningStrategies(repo = {}) {
  const { packageManager = '', mainTreePath = '', copyOnWriteSupported } = repo
  const clone = mainTreePath && copyOnWriteSupported !== false ? [CLONE] : []
  const install = packageManager ? [INSTALL] : []
  return packageManager === PNPM ? [...install, ...clone] : [...clone, ...install]
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

// >>> BEGIN inlined from _shared/resolve_worktree_concurrency.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// resolve_worktree_concurrency — how many story chains may hold a worktree at
// once. Canonical source of truth; inlined into sprint_pipeline.js (the runtime
// cannot import), kept in sync by inline_sync.test.mjs. Pure and unit-tested by
// resolve_worktree_concurrency.test.mjs.
//
// Fan-out used to be bounded by cores alone — min(16, cores - 2), the Workflow
// runtime's own cap. Cores say how many chains a host can work on at once; they
// say nothing about whether sixteen worktrees, each carrying its own
// node_modules, fit on the volume. The two failures are not symmetric: a run
// that is slower than necessary finishes late, and a run that fills the volume
// takes the repository, the sprint, and everything else on that disk with it.
// So the fan-out is the smaller of the two bounds.
//
// Which bound it was is reported, not inferred, because a run that finished at
// three worktrees on a sixteen-core host is either a nearly-full disk or a bug,
// and only the run knows which. A logged "bound by disk" turns an unexplained
// slow run into a diagnosis.
//
// The measurements come from an agent probe (the runtime has no child_process —
// ADR-0006), so any of them can be missing. A missing measurement is never
// invented into a bound: an unmeasured volume falls back to the core bound and
// says, loudly, that nothing is bounding the run by disk.

const CORES = 'cores'
const DISK = 'disk'

// The Workflow runtime will not run more agents concurrently than this, so no
// bound above it means anything.
const RUNTIME_CONCURRENCY_CEILING = 16

// The host keeps cores for the work that is not a story chain — the session
// driving them, the operator's editor, the OS.
const CORES_RESERVED_FOR_THE_HOST = 2

// A fifth of the free space is never spent. A worktree costs more than the
// dependency directory it is measured by — a checkout, build output, logs — and
// a volume driven to its last free byte fails everything sharing it, not just
// this run.
const SPENDABLE_FRACTION_OF_FREE_DISK = 0.8

// One chain at a time is the floor. A volume too small for even a single
// worktree still runs its stories, one after another, because zero is not a
// fan-out any batch can proceed under; the outcome says so rather than leaving
// the operator with a batch that never starts.
const SERIAL = 1

const BYTES_PER_GIB = 1024 ** 3

// Resolves to { limit, boundBy, outcome }: how many story chains may run
// concurrently, which of the two constraints held it there, and the line the
// run is logged by. Takes { cpuCores, availableBytes, bytesPerWorktree }, each
// as the probe reported it — zero or absent means unmeasured.
function resolveWorktreeConcurrency(measurements = {}) {
  const cores = concurrencyFromCores(measurements.cpuCores)
  if (!diskWasMeasured(measurements)) return boundByCoresAlone(measurements, cores)

  const bounds = { cores, disk: concurrencyFromDisk(measurements) }
  if (bounds.disk < bounds.cores) return boundByDisk(measurements, bounds)
  return boundByCores(measurements, bounds)
}

function concurrencyFromCores(cpuCores) {
  if (!isMeasured(cpuCores)) return RUNTIME_CONCURRENCY_CEILING
  const forStories = Math.floor(cpuCores) - CORES_RESERVED_FOR_THE_HOST
  return atLeastSerial(Math.min(RUNTIME_CONCURRENCY_CEILING, forStories))
}

function concurrencyFromDisk({ availableBytes, bytesPerWorktree }) {
  return atLeastSerial(Math.floor(spendableBytes(availableBytes) / bytesPerWorktree))
}

function boundByDisk(measurements, bounds) {
  return {
    limit: bounds.disk,
    boundBy: DISK,
    outcome: oneWorktreeExceedsTheBudget(measurements)
      ? crowdedVolumeOutcome(measurements, bounds)
      : diskBoundOutcome(measurements, bounds),
  }
}

function boundByCores(measurements, bounds) {
  return {
    limit: bounds.cores,
    boundBy: CORES,
    outcome:
      `Worktree fan-out: ${bounds.cores} concurrent worktrees — bound by cores: ` +
      `${describeCoreBound(measurements.cpuCores)}. Disk would have allowed ${bounds.disk} ` +
      `(${describeDiskBudget(measurements)}).`,
  }
}

function diskBoundOutcome(measurements, bounds) {
  return (
    `Worktree fan-out: ${bounds.disk} concurrent worktrees — bound by disk ` +
    `(${describeDiskBudget(measurements)}). Cores would have allowed ${bounds.cores} ` +
    `(${describeCoreBound(measurements.cpuCores)}).`
  )
}

// The volume has no room for the fan-out the batch was going to run, so the
// batch runs serially — and even that is not proven to fit, since one worktree
// alone overruns the budget. Loud, because the operator is one story away from
// a full disk and nothing here can prevent it.
function crowdedVolumeOutcome(measurements, bounds) {
  return (
    `WARNING: Worktree fan-out: ${bounds.disk} concurrent worktree — bound by disk, and a single ` +
    `worktree already exceeds the budget (${describeDiskBudget(measurements)}). Stories run one at ` +
    `a time and the volume may still fill. Free space on this volume before running a larger batch.`
  )
}

// Nothing to divide, so nothing bounds this run by disk. The core bound still
// holds and the batch still runs — an unmeasured volume is not evidence of a
// full one — but the run says which measurement was missing, because that is
// the fact an operator needs when the disk does fill.
function boundByCoresAlone({ availableBytes, bytesPerWorktree, cpuCores }, cores) {
  return {
    limit: cores,
    boundBy: CORES,
    outcome:
      `WARNING: Worktree fan-out: ${cores} concurrent worktrees — bound by cores: ` +
      `${describeCoreBound(cpuCores)}, and by nothing else: free disk is ` +
      `${describeMeasurement(availableBytes)} and the per-worktree footprint is ` +
      `${describeMeasurement(bytesPerWorktree)}, so this run is NOT bounded by disk and a full ` +
      `fan-out could exhaust the volume.`,
  }
}

// The arithmetic behind the core bound, so a run that fanned out to six on an
// eight-core host needs no second source to explain itself.
function describeCoreBound(cpuCores) {
  if (!isMeasured(cpuCores)) {
    return `the runtime ceiling of ${RUNTIME_CONCURRENCY_CEILING}, since the host's core count is not measured`
  }
  return (
    `min(${RUNTIME_CONCURRENCY_CEILING}, ${Math.floor(cpuCores)} cores - ` +
    `${CORES_RESERVED_FOR_THE_HOST} reserved for the host)`
  )
}

function describeDiskBudget({ availableBytes, bytesPerWorktree }) {
  return (
    `${describeMeasurement(spendableBytes(availableBytes))} spendable of ` +
    `${describeMeasurement(availableBytes)} free, at ` +
    `${describeMeasurement(bytesPerWorktree)} per worktree`
  )
}

function describeMeasurement(bytes) {
  return isMeasured(bytes) ? `${(bytes / BYTES_PER_GIB).toFixed(1)} GiB` : 'not measured'
}

function oneWorktreeExceedsTheBudget({ availableBytes, bytesPerWorktree }) {
  return spendableBytes(availableBytes) < bytesPerWorktree
}

function spendableBytes(availableBytes) {
  return availableBytes * SPENDABLE_FRACTION_OF_FREE_DISK
}

function diskWasMeasured({ availableBytes, bytesPerWorktree }) {
  return isMeasured(availableBytes) && isMeasured(bytesPerWorktree)
}

// The probe reports what it could read and zero for what it could not, so a
// measurement is a positive, finite number of bytes or cores and nothing else.
function isMeasured(value) {
  return Number.isFinite(value) && value > 0
}

function atLeastSerial(limit) {
  return Math.max(SERIAL, limit)
}
// <<< END inlined from _shared/resolve_worktree_concurrency.mjs <<<

// >>> BEGIN inlined from _shared/limit_concurrency.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// limit_concurrency — the fan-out bound, enforced. Canonical source of truth;
// inlined into sprint_pipeline.js. Pure control flow over injected callbacks and
// unit-tested by limit_concurrency.test.mjs.
//
// resolve_worktree_concurrency decides how many story chains may hold a worktree
// at once; this is what holds the batch to that number. Callers wrap the part of
// a chain that occupies a worktree in withSlot, and a chain that asks for a slot
// while all of them are taken waits, in the order it asked, until one is
// released.
//
// The slot is released in a finally, so a chain that threw frees the disk it was
// occupying — a limiter that leaked a slot per failure would converge on a batch
// that never runs another story.
//
// ORDERING IS LOAD-BEARING: a caller takes its slot AFTER awaiting whatever it
// depends on, never before. A dependent holding a slot while it waits for a
// blocker that has not started yet deadlocks the batch as soon as the limit is
// smaller than the chain depth — the same R2 deadlock the serial-in-tree driver
// avoids by putting the dependency-await ahead of its lock.

const SMALLEST_LIMIT = 1

function createConcurrencyLimiter(limit) {
  if (!Number.isInteger(limit) || limit < SMALLEST_LIMIT) {
    throw new Error(
      `createConcurrencyLimiter: limit must be a positive whole number of slots, got ${limit}.`,
    )
  }

  const waiting = []
  let inFlight = 0

  async function withSlot(run) {
    await acquireSlot()
    try {
      return await run()
    } finally {
      releaseSlot()
    }
  }

  function acquireSlot() {
    if (inFlight < limit) {
      inFlight++
      return Promise.resolve()
    }
    return new Promise(resolve => waiting.push(resolve))
  }

  // The released slot passes straight to the longest-waiting caller rather than
  // being given up and re-taken, so a queued chain cannot be overtaken by one
  // that asks later.
  function releaseSlot() {
    const admitNext = waiting.shift()
    if (admitNext) {
      admitNext()
      return
    }
    inFlight--
  }

  return withSlot
}
// <<< END inlined from _shared/limit_concurrency.mjs <<<

// >>> BEGIN inlined from _shared/classify_story_failure.mjs — DRY source of truth; regenerate via inline_sync, do not hand-edit >>>
// classify_story_failure — the two classes a story's failure falls into, and the
// status each is reported under. Canonical source of truth; inlined into
// sprint_pipeline.js (the runtime cannot import), kept in sync by
// inline_sync.test.mjs. Pure and unit-tested by classify_story_failure.test.mjs.
//
// 'failed' says one thing: the story's code did not work. A worktree that never
// obtained node_modules never ran the story's code at all, and reporting that
// under the same status sends the next reader hunting a defect that does not
// exist — an hour spent on a phantom bug, and the real fix (a filesystem, a
// lockfile, a registry) untouched. So the tree's failure is its own outcome,
// 'infrastructure-failed', and the story's own failure is left exactly as it was.
//
// The infrastructure reason names the strategy that failed, because the fix
// differs by strategy — a clone that failed points at the filesystem, an install
// at the lockfile or the network, a symlink at the main tree — and it ends with
// the worktree's own words, so the operator reads what the command actually said
// rather than a paraphrase of it.

const FAILED = 'failed'
const INFRASTRUCTURE_FAILED = 'infrastructure-failed'

// A worktree that reported no detail is still a worktree that failed, and the
// strategy alone is enough to act on; a reason ending in a bare colon is not.
const NO_DETAIL_REPORTED = 'the worktree reported no detail'

// The story ran and its code did not work — the one thing 'failed' has ever
// meant here, unchanged.
function codeFailure(detail) {
  return { status: FAILED, reason: `Unhandled error: ${detail}` }
}

// The worktree could not obtain its dependencies, so nothing in it ever ran the
// story's code.
function dependencySetupFailure({ strategy, detail = '' }) {
  return {
    status: INFRASTRUCTURE_FAILED,
    reason:
      `Dependency setup failed under the '${strategy}' strategy, so the story's code was never ` +
      `exercised — this is an infrastructure failure of the worktree, not a defect in the story. ` +
      `The worktree reported: ${detail || NO_DETAIL_REPORTED}`,
  }
}
// <<< END inlined from _shared/classify_story_failure.mjs <<<

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
  // 'auto' detects whether a fresh worktree can obtain node_modules; existing
  // callers omit it.
  isolationStrategy = 'auto',
  // How a fresh worktree obtains node_modules: 'assume-present' | 'clone' |
  // 'install' | 'symlink'. Omitted, it is chosen from the repo (below).
  dependencyStrategy,
} = normalizeArgs(args, 'sprint_pipeline')

if (!stories || stories.length === 0) {
  log('No stories in sprint — exiting.')
  return []
}

log(`Sprint pipeline: ${stories.length} stories on release branch ${releaseBranch} (backend=${backendMode}).`)

const REPO_LAYOUT_PROBE_SCHEMA = {
  type: 'object',
  required: [
    'stdout',
    'mainTreePath',
    'rootFiles',
    'errored',
    'availableDiskBytes',
    'dependencyDirectoryBytes',
    'cpuCores',
    'copyOnWriteSupported',
  ],
  properties: {
    stdout: { type: 'string' },
    mainTreePath: { type: 'string' },
    rootFiles: { type: 'array', items: { type: 'string' } },
    errored: { type: 'boolean' },
    availableDiskBytes: { type: 'number' },
    dependencyDirectoryBytes: { type: 'number' },
    cpuCores: { type: 'number' },
    copyOnWriteSupported: { type: 'boolean' },
  },
}

// What the probe answers with when it could not answer at all. Zero reads as
// "not measured" everywhere downstream, and an errored layout is the safe
// default (serial-in-tree).
const UNPROBED_REPO_LAYOUT = {
  stdout: '',
  mainTreePath: '',
  rootFiles: [],
  errored: true,
  availableDiskBytes: 0,
  dependencyDirectoryBytes: 0,
  cpuCores: 0,
  copyOnWriteSupported: false,
}

const RESET_RETURN_SCHEMA = {
  type: 'object',
  required: ['done'],
  properties: {
    done: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

// Probe the facts the batch's execution model rests on: whether node_modules is
// tracked, where the main working tree is, which lockfile the repository root
// carries, and what the host has to spend on concurrent worktrees — free disk,
// the size of one dependency directory, and the core count. The runtime has no
// child_process (ADR-0006), so the commands are delegated to an agent; the pure
// resolvers (inlined above) turn the answers into strategies and bounds. A
// failed probe is treated as a command error → the safe default, and any
// measurement the host would not give up comes back as 0, which reads as
// unmeasured rather than as zero bytes.
async function probeRepoLayout() {
  phase('Detect')
  const probe = await agent(
    `Report eight facts about this repository and the machine it sits on. A fresh \`git worktree add\` materializes tracked files only, so the first four decide how the sprint's stories are executed, the next three decide how many run at once, and the last decides whether a worktree can be filled by a cheap clone or must pay a full install.

Run \`git ls-files node_modules\` and \`git rev-parse --show-toplevel\` at the repository root, list the entries directly in that root directory, and read the host's free disk, dependency-directory size, and core count. Return:
  - stdout: the stdout of \`git ls-files node_modules\` verbatim (empty string if it printed nothing)
  - mainTreePath: the absolute path \`git rev-parse --show-toplevel\` printed (empty string if it printed nothing)
  - rootFiles: the names — not paths — of the entries directly in the repository root, e.g. ["package.json", "pnpm-lock.yaml", "src"]
  - errored: true ONLY if git could not run at all (e.g. not a git repository); false otherwise, including the normal empty-output case.
  - availableDiskBytes: free space in BYTES on the volume holding the repository root, from \`df -k .\` there — that column is 1024-byte blocks, so multiply it by 1024. Use 0 if it cannot be read.
  - dependencyDirectoryBytes: the size in BYTES of \`node_modules\` at the repository root, from \`du -sk node_modules\` there — that number is 1024-byte blocks, so multiply it by 1024. Use 0 if the directory does not exist or the command fails.
  - cpuCores: the machine's CPU core count, from \`sysctl -n hw.ncpu\` (macOS) or \`nproc\` (Linux). Use 0 if it cannot be read.
  - copyOnWriteSupported: whether the filesystem holding the repository root supports copy-on-write file cloning. Test it rather than inferring from the OS: create a small temporary file under the repository root, run \`cp -c\` on it (macOS/APFS) or \`cp --reflink=always\` (Linux/btrfs/XFS), report true only if that command exits 0, then delete both. Report **false** if the command fails, the flag is unsupported, or you could not test it — false is the safe answer, because it makes a clone fall back to a full install rather than attempting a clone that cannot work.

Report 0 for any of the three measurements you could not take — do not estimate one.

Do NOT create, modify, or delete anything.`,
    {
      label: 'detect-layout',
      phase: 'Detect',
      schema: REPO_LAYOUT_PROBE_SCHEMA,
      ...resolveAgentTier('detect-layout', { sessionModel }),
    },
  )
  return probe || UNPROBED_REPO_LAYOUT
}

// Resolve one strategy for the whole batch (F5): honor a concrete override,
// else auto-detect; log the evidence and source (F10).
function resolveIsolationStrategy(probe, viableProvisioning) {
  const detected = classifyIsolationStrategy(probe.stdout, probe.errored, viableProvisioning)
  const evidence = describeLayoutEvidence(probe)

  if (isolationStrategy === WORKTREE || isolationStrategy === SERIAL_IN_TREE) {
    log(`Isolation strategy: ${isolationStrategy} (source=override, git ls-files node_modules: ${evidence}).`)
    return isolationStrategy
  }

  log(
    `Isolation strategy: ${detected} (source=auto, git ls-files node_modules: ${evidence}, ` +
      `${describeProvisioningEvidence(probe, viableProvisioning)}).`,
  )
  return detected
}

// A serial-in-tree choice is only actionable if the operator can see which
// input produced it: a probe that could not run, a root with no lockfile and
// no path to clone from, or a filesystem that cannot clone. Naming them beats
// reporting the verdict alone.
function describeProvisioningEvidence(probe, viableProvisioning) {
  if (probe.errored) return 'provisioning: not consulted (probe errored)'
  if (viableProvisioning.length) return `provisioning: ${viableProvisioning.join(', ')}`
  const missing = []
  if (!detectPackageManager(probe.rootFiles)) missing.push('no recognized lockfile')
  if (!probe.mainTreePath) missing.push('no main tree path')
  if (probe.copyOnWriteSupported === false) missing.push('no copy-on-write support')
  return `provisioning: none (${missing.join('; ') || 'no viable strategy'})`
}

function describeLayoutEvidence(probe) {
  if (probe.errored) return 'command-error'
  return dependenciesAreTracked(probe.stdout) ? 'non-empty' : 'empty'
}

// A caller who named a strategy gets it. A caller who named none provisions
// nothing where a fresh worktree already arrives with its dependencies —
// tracked node_modules, today's behaviour exactly — and otherwise runs under
// the strategy this repo is best provisioned by, which is what lets an
// untracked repo run its stories in parallel worktrees at all. Nothing viable
// leaves assume-present, and the gate has already sent that batch serial.
function chooseDependencyStrategy(probe, viableProvisioning) {
  if (dependencyStrategy) return dependencyStrategy
  if (dependenciesAreTracked(probe.stdout)) return ASSUME_PRESENT
  return viableProvisioning[0] || ASSUME_PRESENT
}

// The foot-gun the override keeps (F9b): a forced worktree over untracked
// node_modules that nothing provisions. Every worktree then starts
// dependency-empty, so it is warned about and proceeds as instructed — the
// operator may have provisioned them by some other means.
function warnIfForcedWorktreeProvisionsNothing(probe, strategy) {
  const forcedOverUntracked = isolationStrategy === WORKTREE && !dependenciesAreTracked(probe.stdout)
  if (!forcedOverUntracked || strategy !== ASSUME_PRESENT) return
  log(
    `WARNING: isolationStrategy override forces 'worktree' with dependencyStrategy=${ASSUME_PRESENT} over ` +
      `untracked node_modules (git ls-files node_modules: ${describeLayoutEvidence(probe)}). Nothing ` +
      `provisions a fresh worktree, so dependencies must already exist in each one or builds will fail. ` +
      `Proceeding as instructed.`,
  )
}

// Which constraint bound this run's fan-out, on every run. A batch that ran
// three chains on a sixteen-core host is either a nearly-full volume or a bug,
// and only the run knows which — the line says so instead of leaving an
// unexplained slow sprint. Serial-in-tree fans out to nothing at all, so it
// reports that rather than a bound it never applies.
function logFanOutBound(isolation, concurrency) {
  if (isolation === SERIAL_IN_TREE) {
    log(`Worktree fan-out: serial-in-tree runs one story chain at a time, so nothing fans out.`)
    return
  }
  log(concurrency.outcome)
}

const repoLayout = await probeRepoLayout()

// What could fill a fresh, dependency-empty worktree here. The gate reads it to
// answer whether an untracked node_modules still permits parallel worktrees,
// which is the question it exists to ask; a caller who named no strategy runs
// under its first entry.
const viableProvisioning = viableProvisioningStrategies({
  packageManager: detectPackageManager(repoLayout.rootFiles),
  mainTreePath: repoLayout.mainTreePath,
  copyOnWriteSupported: repoLayout.copyOnWriteSupported,
})
const resolvedIsolation = resolveIsolationStrategy(repoLayout, viableProvisioning)

const requestedStrategy = chooseDependencyStrategy(repoLayout, viableProvisioning)
warnIfForcedWorktreeProvisionsNothing(repoLayout, requestedStrategy)

// One dependency strategy for the whole batch, from the same probe. It fills
// FRESH worktrees only: serial-in-tree runs every story in the shared working
// tree, which already carries its dependencies — provisioning over them there
// would overwrite the very directory the strategy exists to reuse — so the
// instruction is withheld and the skip is logged rather than passing silently.
// The batch's stories go in with it: symlink shares one node_modules across
// every worktree, so it refuses a batch carrying a dependency-touching story.
const dependencyProvisioning = resolveDependencyStrategy(requestedStrategy, {
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

// How many story chains may hold a worktree at once. Cores alone are not a
// bound on this: sixteen worktrees, each carrying its own node_modules, is tens
// of gigabytes of transient disk, and the volume is the one resource a run
// cannot recover from exhausting. Every strategy is charged the full measured
// dependency directory, clone and symlink included — a clone diverges from the
// main tree the moment either side writes, so its ceiling is a full copy, and
// over-reserving costs a slower run where under-reserving costs the volume.
const worktreeConcurrency = resolveWorktreeConcurrency({
  cpuCores: repoLayout.cpuCores,
  availableBytes: repoLayout.availableDiskBytes,
  bytesPerWorktree: repoLayout.dependencyDirectoryBytes,
})
logFanOutBound(resolvedIsolation, worktreeConcurrency)

// The bound, enforced. Serial-in-tree already runs one chain at a time, so its
// slots never bind and the limiter is built once for both execution models
// rather than branching around a mode that cannot reach it.
const withWorktreeSlot = createConcurrencyLimiter(worktreeConcurrency.limit)

// Story slugs are unique within an epic, not across the backlog, so the epic is
// what keeps two runs apart: without it, concurrent epics carrying a story of
// the same name drive one ref and the branch ends up wherever the last finisher
// left it. Every prompt that names a story branch names it through here.
function storyBranch(story) {
  return `story/${epicSlug}/${story.slug}`
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
  const branch = storyBranch(story)
  // The changed files are what the post-hoc escalation reconciliation reads, so
  // they are asked for from the agent that already has the branch in hand. The
  // commit order is asked for because the verify stage is placed at the last of
  // them (verifyRevision), which only names the branch head if the order holds.
  const returnLine = `Implement. Commit with a clear message. Return the branch name, the commit SHAs in the order you made them (oldest first), the files the story changed (\`git diff --name-only ${releaseBranch}...${branch}\`), and any notes.`
  const branchStrategyLine =
    isolation === 'worktree'
      ? `**Branch strategy:** You are in an isolated git worktree — work only here; do not touch other branches. Create branch \`${branch}\` from the latest \`${releaseBranch}\` (\`git checkout -b ${branch} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. ${returnLine}`
      : `**Branch strategy:** You are working in the SHARED repository working tree — there is no worktree isolation, and stories run one at a time (serial-in-tree). Create branch \`${branch}\` from the latest \`${releaseBranch}\` and check it out here (\`git checkout -b ${branch} ${releaseBranch}\`); it already contains any in-sprint dependency this story builds on. ${returnLine}`
  const dependencyInstruction = storyProvisioning.get(story.slug).instruction
  // A worktree that cannot obtain node_modules never runs the story's code, so it
  // says which command failed and stops. Reporting that as a story failure would
  // send the next reader hunting a defect that does not exist. Only a strategy
  // that provisions something can fail to.
  const dependencyFailureLine = dependencyInstruction
    ? `If that provisioning cannot be completed — the command fails and nothing here obtains node_modules — do not implement the story. Return \`dependencySetupFailure\` with the command you ran and what it reported, along with the branch name and an empty commit list. That is an infrastructure failure of this worktree, not a failure of this story's code.`
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

${branchStrategyLine}

${dependencyInstruction}
${dependencyFailureLine}

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

// What the verify stage puts its tree at. A branch ref belongs to one worktree
// at a time and the implement worktree still holds this story's, so verify —
// the stage locked out of it — is given a commit instead: a commit belongs to
// no worktree, and detaching at it reads exactly the content implement left
// while contending for nothing. Implement reports its commits in the order it
// made them, so the last is the branch head. A result carrying no commit at all
// falls back to naming the branch: the same content the stage read before, and
// still detached, so a missing SHA costs nothing and reinstates no lock.
function verifyRevision(impl, branch) {
  return impl.commits?.at(-1) || branch
}

function buildVerifyPrompt(impl, story, isolation) {
  const branch = storyBranch(story)
  const revision = verifyRevision(impl, branch)
  const dependencyInstruction = storyProvisioning.get(story.slug).instruction
  const treeLine =
    isolation === 'worktree'
      ? `You are in an isolated git worktree — place it at the story's code with \`git checkout --detach ${revision}\` so any build artifacts stay off the shared working tree.`
      : `You are in the SHARED working tree (serial-in-tree; one story at a time). Place it at the story's code with \`git checkout --detach ${revision}\`; the pipeline resets the tree (tracked changes reverted, untracked non-ignored cruft cleared) before the next story.`
  return `You are running a lightweight verification on story ${story.slug}.

${treeLine}

${dependencyInstruction}

If the project has a build/lint/test command, run it on the checked-out tree. If not, perform a smoke read of the changed files to confirm no obvious runtime defects (broken imports, syntax errors, dangling references).

Return verifyStatus (pass | warn | fail) and brief notes.`
}

function buildOpenPRPrompt(verify, story, impl) {
  const ghOrLocal =
    backendMode === 'github'
      ? `Open a PR via gh CLI targeting ${releaseBranch}. Capture the PR URL.`
      : `Merge ${storyBranch(story)} into ${releaseBranch} locally. Capture the merge commit SHA.`
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

// The worktree never obtained its dependencies, so the story's code was never
// exercised there. That is not the status that means the code did not work — a
// reader given 'failed' here goes looking for a defect that does not exist — so
// it reports the infrastructure failure, naming the strategy that failed and
// what the worktree said about it.
function dependencySetupFailed(story, impl) {
  return makeSprintStoryReturn({
    storySlug: story.slug,
    branch: impl.branch,
    ...dependencySetupFailure({
      strategy: storyProvisioning.get(story.slug).strategy,
      detail: impl.dependencySetupFailure,
    }),
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
  const unmet = await unmetInBatchBlockers(story)
  if (unmet.length) {
    log(`Skipping ${story.slug}: upstream ${unmet.join(', ')} did not complete.`)
    return dependencyBlocked(story, unmet)
  }

  // The slot is taken only once the story is free to run. A chain that held one
  // while waiting on its blocker would deadlock the batch the moment the
  // fan-out bound fell below the depth of the dependency graph.
  return withWorktreeSlot(() => runStoryChain(story, isolation))
}

// The in-batch blockers that did not finish 'done' — empty when the story is
// free to run. Every story's terminal promise is registered before any chain
// starts, so the lookup here always finds one.
async function unmetInBatchBlockers(story) {
  const blockers = inBatchBlockers(story)
  const outcomes = await Promise.all(blockers.map(slug => terminal.get(slug)))
  return blockers.filter((_, index) => outcomes[index]?.status !== 'done')
}

async function runStoryChain(story, isolation) {
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
  if (impl.dependencySetupFailure) return dependencySetupFailed(story, impl)
  reportDependencyEscalationMismatch(story, impl)

  const review = await agent(buildReviewPrompt(impl, story), {
    label: `review:${story.slug}`,
    phase: 'Review',
    schema: REVIEW_VERDICT_SCHEMA,
    ...resolveAgentTier('review', { sessionModel, story }),
  })
  if (!review) return null
  if (review.recommendation === 'block') return reviewBlocked(story, impl, review)

  const verify = await agent(buildVerifyPrompt(impl, story, isolation), {
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
    return makeSprintStoryReturn({ storySlug: story.slug, ...codeFailure(detail) })
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
