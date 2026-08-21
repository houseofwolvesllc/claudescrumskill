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
  'teardown': { model: CHEAPEST, effort: 'low' },
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

export function resolveAgentTier(stage, { sessionModel, story } = {}) {
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
