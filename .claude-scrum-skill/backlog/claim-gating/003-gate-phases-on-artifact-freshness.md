---
title: Gate Phase 2 and Phase 3 completion on artifact freshness
epic: claim-gating
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:claim-gating
persona: impl
blocked_by:
  - claim-gating/002
---

## Objective

Gate Phase 2 and Phase 3 completion on artifact freshness

## Acceptance Criteria

- [ ] skills/project-orchestrate/SKILL.md conditions Phase 2 completion on the emulation report being fresh
- [ ] It conditions Phase 3 completion on the cleanup report being fresh
- [ ] The documented gate names the artifact path and the failure behaviour
- [ ] A phase whose artifact predates the phase start cannot be reported complete
- [ ] A structural test asserts both phase-completion sections reference the freshness gate

## Technical Context

/project-emulate writes .claude-scrum-skill/reports/emulation-report/ and /project-cleanup writes .claude-scrum-skill/reports/cleanup-report/. In the reported run the orchestrator wrote 'Scoped emulation (the affected surfaces only)' into both the state file and its completion summary while nothing in the emulation report directory had been touched in weeks, and substituted a manual tsc/test/lint sweep for /project-cleanup --fix, which never ran at all. Both claims were disprovable by one stat. Existing structural guards over SKILL.md content live in test/skill_guarding_sequences.test.js — follow that pattern.
