---
title: Reduce adversarial_verify from three agents to two
epic: verification-deduplication
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:verification-deduplication
persona: impl
---

## Objective

Reduce adversarial_verify from three agents to two

## Acceptance Criteria

- [ ] The claimant agent is removed from adversarial_verify.js
- [ ] The judge receives the finding directly as the affirmative position, in place of the claimant's summary and evidence
- [ ] The skeptic stage is unchanged in intent
- [ ] The returned shape is updated coherently and project-emulate/SKILL.md's documented return shape matches
- [ ] Per-finding agent count is 2, verified by inspection

## Technical Context

adversarial_verify.js currently runs claimant + skeptic in parallel then a judge, per finding. The finding is itself the claim, so the claimant restates existing input. On a 20-finding run this drops 60 agents to 40.
