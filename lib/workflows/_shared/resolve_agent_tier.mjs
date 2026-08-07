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

export function resolveAgentTier(stage, sessionModel) {
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
