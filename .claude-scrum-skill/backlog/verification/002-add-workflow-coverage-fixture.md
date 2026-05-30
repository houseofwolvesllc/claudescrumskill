---
title: Add workflow_invocation_check.md smoke-test fixture
epic: verification
status: backlog
executor: claude
priority: P2-medium
points: 2
labels: [type:story, executor:claude, P2-medium, epic:verification, ready-for-work]
persona: impl
blocked_by: [skill-rewrites/001, skill-rewrites/002, skill-rewrites/003, skill-rewrites/004]
blocks: []
sprint: null
---

## Objective

Add a new fixture at `docs/specs/_fixtures/workflow_invocation_check.md` — a minimal PRD whose orchestration exercises every workflow script at least once. Used as the v2.0.0 smoke test.

## Acceptance Criteria

- [ ] Fixture is a complete PRD with 2+ epics (triggers two-pass via threshold)
- [ ] Orchestrating it should exercise: sprint_pipeline (sprint execution), elaborate_epics (Pass 2), adversarial_verify (emulation), review_panel (cleanup)
- [ ] Fixture README updated with the new case

## Dependencies
- **Blocked by:** all skill-rewrites stories
- **Blocks:** none
