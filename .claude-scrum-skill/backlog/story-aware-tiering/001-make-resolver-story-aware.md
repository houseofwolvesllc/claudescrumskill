---
title: Make the tier resolver story-aware with a mandatory implement floor
epic: story-aware-tiering
status: backlog
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:story-aware-tiering
persona: impl
---

## Objective

Make the tier resolver story-aware with a mandatory implement floor

## Acceptance Criteria

- [ ] resolveAgentTier accepts the story being worked, and the story argument is optional
- [ ] implement resolves one tier down at 1-5 points and to the session model at 8-13 points
- [ ] implement never resolves to the cheapest tier at any point value
- [ ] review resolves to cheapest at 1-2 points and one tier down at 3-13 points
- [ ] verify resolves to cheapest at every point value
- [ ] detect-layout, reset, and pr are unchanged at cheapest; elaborate is unchanged at session
- [ ] With no story supplied the resolver falls back to pure stage tiering
- [ ] The session clamp still holds: no stage resolves above the session model
- [ ] Unit tests cover the full stage x points grid, the implement floor at every point value, and the no-story fallback

## Technical Context

lib/workflows/_shared/resolve_agent_tier.mjs. Current signature is resolveAgentTier(stage, sessionModel), inlined identically into sprint_pipeline.js, adversarial_verify.js, and elaborate_epics.js. A two-argument shape such as resolveAgentTier(stage, { sessionModel, story }) extends without churning call sites, but any shape is acceptable provided story is optional. verify moves to always-cheapest because it runs a build/lint/test command and reports a status, which is not a judgment task. Keep this a pure function over constant maps per the Arbitration Rule — no class hierarchy.
