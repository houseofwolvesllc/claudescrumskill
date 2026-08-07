---
title: Guard that relative stages resolve to a distinct model
epic: tier-contract-plumbing
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:tier-contract-plumbing
persona: impl
---

## Objective

Guard that relative stages resolve to a distinct model

## Acceptance Criteria

- [ ] A test asserts that with a known sessionModel, every relative stage resolves to a model distinct from the session model
- [ ] A test asserts that with sessionModel absent, relative stages return a safe inherit rather than throwing
- [ ] The failure message names the stage and what it resolved to
- [ ] The existing declaration guard in agent_tiers.test.mjs is retained unchanged

## Technical Context

agent_tiers.test.mjs asserts every agent() call DECLARES a tier; it cannot catch a declared tier that then resolves to nothing. Both guards are needed and they catch different defects: one a bare call site, the other a call site whose tier evaporates at resolution. Colocate with the existing resolver tests at lib/workflows/_shared/resolve_agent_tier.test.mjs or beside agent_tiers.test.mjs, following house style.
