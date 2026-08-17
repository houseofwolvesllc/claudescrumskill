---
title: Add the dependencyStrategy argument and its four strategies
epic: dependency-provisioning
status: backlog
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:dependency-provisioning
persona: impl
---

## Objective

Add the dependencyStrategy argument and its four strategies

## Acceptance Criteria

- [ ] sprint_pipeline.js accepts a dependencyStrategy argument with values assume-present, clone, install, and symlink
- [ ] assume-present is the default and reproduces current behaviour exactly
- [ ] clone performs a copy-on-write clone of the dependency directory into the worktree
- [ ] install runs the project's clean-install command in the worktree
- [ ] symlink links the worktree's dependency directory to the main tree's
- [ ] Each strategy's outcome is logged, naming the strategy used
- [ ] Unit tests cover each strategy's resolution and its preconditions

## Technical Context

The strategies differ along a known, closed axis, which is why the spec's pattern pass named a candidate Strategy — non-binding: if the four collapse to a dispatch table plus four small functions, that is the right answer and the pattern was a hypothesis that did not survive. The Arbitration Rule governs. On darwin/APFS the clone mechanism is `cp -c -R`; measured at 5ms for a 200MB tree versus 59ms for a real copy, and the gap widens on node_modules because clonefile is metadata-only while cp -R pays per file.
