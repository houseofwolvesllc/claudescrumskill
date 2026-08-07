---
title: Add a stage-to-tier resolver with session-model degradation
epic: agent-tiering
status: backlog
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:agent-tiering
persona: impl
---

## Objective

Add a stage-to-tier resolver with session-model degradation

## Acceptance Criteria

- [ ] A resolver maps each agent stage to a (model, effort) pair
- [ ] When the session model is already at or below the target tier, the resolver returns the session model rather than tiering down
- [ ] The resolver is unit-tested for every stage and for the degradation path
- [ ] The resolver is a plain function over a constant map; no class hierarchy or injected abstraction is introduced

## Technical Context

Candidate Strategy pattern per the spec's pattern pass, non-binding: may collapse to a function if the by-model-family variation does not materialize. The Workflow runtime cannot import across files, so shared logic must follow the existing inline_sync convention used for normalize_args.
