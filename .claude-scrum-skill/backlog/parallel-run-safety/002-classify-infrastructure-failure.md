---
title: Report dependency setup failure as infrastructure, not code failure
epic: parallel-run-safety
status: done
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:parallel-run-safety
persona: impl
---

## Objective

Report dependency setup failure as infrastructure, not code failure

## Acceptance Criteria

- [ ] A worktree whose dependency setup fails reports an outcome distinct from status: failed
- [ ] The distinct outcome is documented in the return schema and in the invoking SKILL.md
- [ ] The failure message names the strategy that failed and why
- [ ] A code failure still reports status: failed unchanged
- [ ] Unit tests cover both failure classes

## Technical Context

Today status: failed means the story's code did not work. Reusing it for a failed install sends someone hunting a phantom bug — that is the failure mode to design out. SprintStoryReturnSchema currently allows done, blocked, and failed.
