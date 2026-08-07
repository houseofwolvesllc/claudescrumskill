import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveAgentTier } from './resolve_agent_tier.mjs'

const SESSION_MODEL = 'opus'
const CHEAPEST_MODEL = 'haiku'

// Stands in for the absent model key, so both what is asserted and what a
// failure reports are the model the stage actually runs at.
const INHERITS_SESSION = 'inherit'

test('detect-layout runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('detect-layout', { sessionModel: 'opus' }), {
    model: 'haiku',
    effort: 'low',
  })
})

test('reset runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('reset', { sessionModel: 'opus' }), {
    model: 'haiku',
    effort: 'low',
  })
})

test('pr runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('pr', { sessionModel: 'opus' }), {
    model: 'haiku',
    effort: 'low',
  })
})

test('verify runs at the cheapest tier with low effort', () => {
  assert.deepEqual(resolveAgentTier('verify', { sessionModel: 'opus' }), {
    model: 'haiku',
    effort: 'low',
  })
})

test('implement inherits the session model and the session effort (sets neither)', () => {
  assert.deepEqual(resolveAgentTier('implement', { sessionModel: 'opus' }), {})
})

test('elaborate inherits the session model but pins medium effort', () => {
  assert.deepEqual(resolveAgentTier('elaborate', { sessionModel: 'opus' }), { effort: 'medium' })
})

test('review runs one tier down from the session model at medium effort', () => {
  assert.deepEqual(resolveAgentTier('review', { sessionModel: 'opus' }), {
    model: 'sonnet',
    effort: 'medium',
  })
})

test('skeptic runs one tier down from the session model at medium effort', () => {
  assert.deepEqual(resolveAgentTier('skeptic', { sessionModel: 'opus' }), {
    model: 'sonnet',
    effort: 'medium',
  })
})

test('judge runs one tier down from the session model at medium effort', () => {
  assert.deepEqual(resolveAgentTier('judge', { sessionModel: 'opus' }), {
    model: 'sonnet',
    effort: 'medium',
  })
})

test('a one-tier-down stage steps opus to sonnet, and sonnet to haiku', () => {
  assert.equal(resolveAgentTier('review', { sessionModel: 'opus' }).model, 'sonnet')
  assert.equal(resolveAgentTier('review', { sessionModel: 'sonnet' }).model, 'haiku')
})

test('a one-tier-down stage stays at the session model when the session is already cheapest', () => {
  assert.deepEqual(resolveAgentTier('judge', { sessionModel: 'haiku' }), {
    model: 'haiku',
    effort: 'medium',
  })
})

test('a cheapest-tier stage stays at the session model when the session is already cheapest', () => {
  assert.deepEqual(resolveAgentTier('pr', { sessionModel: 'haiku' }), {
    model: 'haiku',
    effort: 'low',
  })
})

test('a one-tier-down stage inherits the session model when the session model is unrecognized', () => {
  assert.deepEqual(resolveAgentTier('review', { sessionModel: 'some-future-model' }), {
    effort: 'medium',
  })
})

test('a one-tier-down stage inherits the session model when no session model is supplied', () => {
  assert.deepEqual(resolveAgentTier('review'), { effort: 'medium' })
})

test('a cheapest-tier stage still tiers down when no session model is supplied', () => {
  assert.deepEqual(resolveAgentTier('detect-layout'), { model: 'haiku', effort: 'low' })
})

test('an unknown stage throws and names the stages it knows', () => {
  assert.throws(
    () => resolveAgentTier('lens', { sessionModel: 'opus' }),
    /resolveAgentTier: unknown stage 'lens'\. Known stages: .*\bjudge\b/,
  )
})

// The stage x difficulty grid, as the models each stage resolves to for an opus
// session. Rows are stages; columns are point values in STORY_POINTS order.
// implement climbs with difficulty, review climbs one band earlier, and every
// other stage costs the same whatever the story weighs.
const STORY_POINTS = [1, 2, 3, 5, 8, 13]
const GRID_MODELS = {
  'implement': ['sonnet', 'sonnet', 'sonnet', 'sonnet', INHERITS_SESSION, INHERITS_SESSION],
  'review': ['haiku', 'haiku', 'sonnet', 'sonnet', 'sonnet', 'sonnet'],
  'verify': ['haiku', 'haiku', 'haiku', 'haiku', 'haiku', 'haiku'],
  'detect-layout': ['haiku', 'haiku', 'haiku', 'haiku', 'haiku', 'haiku'],
  'reset': ['haiku', 'haiku', 'haiku', 'haiku', 'haiku', 'haiku'],
  'pr': ['haiku', 'haiku', 'haiku', 'haiku', 'haiku', 'haiku'],
  'elaborate': Array(STORY_POINTS.length).fill(INHERITS_SESSION),
}

test('every stage resolves its difficulty grid row across the point scale', () => {
  for (const [stage, expectedModels] of Object.entries(GRID_MODELS)) {
    STORY_POINTS.forEach((points, column) => {
      const { model = INHERITS_SESSION } = resolveAgentTier(stage, {
        sessionModel: SESSION_MODEL,
        story: { points },
      })
      assert.equal(model, expectedModels[column], `stage '${stage}' at ${points} points`)
    })
  }
})

// The floor swept across the whole estimate range, not just the Fibonacci
// values a story is normally given: `points` is authored before anyone read the
// code, and a mis-estimated 1-pointer must degrade one tier, never to the
// weakest model. review may floor lower — a weak review is caught downstream by
// verify and the tests, whereas a weak implementation is the artifact.
const HIGHEST_ESTIMATE = 13

test('implement never resolves to the cheapest model at any point value', () => {
  for (let points = 1; points <= HIGHEST_ESTIMATE; points++) {
    const { model = SESSION_MODEL } = resolveAgentTier('implement', {
      sessionModel: SESSION_MODEL,
      story: { points },
    })
    assert.notEqual(model, CHEAPEST_MODEL, `implement fell to the cheapest model at ${points} points`)
  }
})

// Ascending capability, mirroring the resolver's own ladder: a stage's resolved
// model must never sit above the session's on it.
const ASCENDING_MODELS = ['haiku', 'sonnet', 'opus']

test('no stage resolves above the session model at any point value', () => {
  for (const sessionModel of ASCENDING_MODELS) {
    for (const stage of Object.keys(GRID_MODELS)) {
      for (const points of STORY_POINTS) {
        const { model = sessionModel } = resolveAgentTier(stage, { sessionModel, story: { points } })
        assert.ok(
          ASCENDING_MODELS.indexOf(model) <= ASCENDING_MODELS.indexOf(sessionModel),
          `stage '${stage}' at ${points} points resolved to '${model}' above session '${sessionModel}'`,
        )
      }
    }
  }
})

test('the difficulty-varying stages fall back to stage tiering when no story is supplied', () => {
  assert.deepEqual(resolveAgentTier('implement', { sessionModel: SESSION_MODEL }), {})
  assert.deepEqual(resolveAgentTier('review', { sessionModel: SESSION_MODEL }), {
    model: 'sonnet',
    effort: 'medium',
  })
})

test('a story with no estimate carries no difficulty signal and falls back to stage tiering', () => {
  const story = { slug: 'unestimated' }
  assert.deepEqual(resolveAgentTier('implement', { sessionModel: SESSION_MODEL, story }), {})
  assert.deepEqual(resolveAgentTier('review', { sessionModel: SESSION_MODEL, story }), {
    model: 'sonnet',
    effort: 'medium',
  })
})

// The stages STAGE_TIERS targets at `one-tier-down`: the only ones whose model
// is computed from the session's rather than named outright, and so the only
// ones that can declare a tier and still resolve to no model at all.
// agent_tiers.test.mjs cannot catch that — it reads call site source text,
// where a tier that resolves and a tier that evaporates are the same spread.
// The guards below sweep every relative stage, per stage, in one pass.
const RELATIVE_STAGES = ['review', 'skeptic', 'judge']

test('every relative stage resolves to a model distinct from a known session model', () => {
  for (const stage of RELATIVE_STAGES) {
    // An absent model key means "inherit the session", so a relative stage that
    // resolves to nothing is a stage running at the session model itself.
    const { model = SESSION_MODEL } = resolveAgentTier(stage, { sessionModel: SESSION_MODEL })
    assert.notEqual(
      model,
      SESSION_MODEL,
      `relative stage '${stage}' resolved to '${model}' for session model '${SESSION_MODEL}'`,
    )
  }
})

test('every relative stage inherits the session when no session model is supplied', () => {
  for (const stage of RELATIVE_STAGES) {
    const { model = INHERITS_SESSION } = resolveAgentTier(stage)
    assert.equal(
      model,
      INHERITS_SESSION,
      `relative stage '${stage}' resolved to '${model}' with no session model to tier down from`,
    )
  }
})
