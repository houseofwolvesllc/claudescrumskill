---
title: Reduce ENGINEERING_BASELINE.md to its project-specific stance
epic: prompt-surface-detox
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:prompt-surface-detox
persona: impl
---

## Objective

Reduce ENGINEERING_BASELINE.md to its project-specific stance

## Acceptance Criteria

- [ ] The file is approximately 150 words, down from ~1,077
- [ ] The Arbitration Rule is preserved verbatim
- [ ] The four Emergence priorities are preserved
- [ ] The precedence order (project CLAUDE.md > baseline > situational guidance) is preserved
- [ ] Restatements of Clean Code and TDD canon are removed
- [ ] Every skill and workflow that references the file still resolves and reads coherently

## Technical Context

Lines 30-141 restate Martin's naming/function/comment rules, Beck's red-green-refactor, F.I.R.S.T., and SOLID. Read by every implementation, review, and hardening agent via baselinePath.
