---
title: Rewrite the isolation gate and detect the package manager
epic: dependency-provisioning
status: done
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:dependency-provisioning
persona: impl
blocked_by:
  - dependency-provisioning/002
  - dependency-provisioning/003
---

## Objective

Rewrite the isolation gate and detect the package manager

## Acceptance Criteria

- [ ] classifyIsolationStrategy selects worktree mode when a viable dependencyStrategy exists
- [ ] It falls back to serial-in-tree only when no viable strategy exists
- [ ] A repo with untracked node_modules runs stories in parallel worktrees
- [ ] The existing isolationStrategy override semantics are preserved, including the forced-worktree warning, reworded for the assume-present case
- [ ] The package manager is resolved from the lockfile present: npm, pnpm, yarn, or bun
- [ ] On a pnpm project the resolver prefers install over clone
- [ ] Unit tests cover gate selection across tracked/untracked, filesystem support, and each package manager

## Technical Context

lib/workflows/_shared/detect_repo_layout.mjs currently returns SERIAL_IN_TREE whenever `git ls-files node_modules` is empty. pnpm's content-addressable store already makes per-worktree installs cheap, so the cost tradeoff this spec manages does not apply there and install is simply better.
