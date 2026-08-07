---
title: Remove the stray ultrathink token from project-spec
epic: prompt-surface-detox
status: backlog
executor: claude
priority: P1-high
points: 1
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:prompt-surface-detox
persona: impl
---

## Objective

Remove the stray ultrathink token from project-spec

## Acceptance Criteria

- [ ] The trailing 'ultrathink' token is removed from skills/project-spec/SKILL.md line 8
- [ ] The surrounding sentence reads correctly
- [ ] No other thinking-scaffold tokens remain anywhere in the prompt surface

## Technical Context

Sits mid-sentence at the end of the overview line, reading like an accidental paste. Opus 5 thinks by default, so it forces maximum thinking on every spec run.
