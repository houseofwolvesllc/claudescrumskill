---
title: Add sessionModel to the workflow invocation contracts
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

Add sessionModel to the workflow invocation contracts

## Acceptance Criteria

- [ ] skills/project-orchestrate/SKILL.md documents sessionModel in the sprint_pipeline invocation block
- [ ] skills/project-emulate/SKILL.md documents sessionModel in the adversarial_verify invocation block
- [ ] skills/project-scaffold/SKILL.md documents sessionModel in the elaborate_epics invocation block
- [ ] Each contract line names the accepted values and states that omitting it makes relative stages inherit the session tier silently
- [ ] The argument remains optional in all three contracts

## Technical Context

The invocation blocks are YAML fences in each SKILL.md listing the args the orchestrator fills in (epicSlug, backendMode, baselinePath, isolationStrategy, and so on). sessionModel joins them. Relative stages by workflow: sprint_pipeline has review; adversarial_verify has skeptic and judge and is therefore fully inert without it; elaborate_epics has none but takes the argument for consistency. Do not introspect the model programmatically — there is no such API.
