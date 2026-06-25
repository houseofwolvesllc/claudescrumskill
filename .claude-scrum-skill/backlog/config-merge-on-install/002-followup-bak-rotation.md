---
title: "Follow-up: preserve prior config.json.bak across repeated recoveries"
status: backlog
executor: claude
priority: P3-low
points: 2
labels: [type:chore, source:review]
persona: impl
---

## Objective
Avoid silently discarding an earlier `config.json.bak` when the installer
recovers from a malformed config more than once.

## Context
From the release review of `release/config-merge-on-install` (Warning 1):
`installConfig`'s `recovered` branch does
`fs.copyFileSync(destPath, destPath + '.bak')`, which clobbers any prior
`.bak`. In the normal flow this is harmless — after a recovery the dest is
valid, so the next run merges rather than recovers. The data-loss window only
exists if a user re-corrupts the config between installs. Spec F5 (preserve the
original bytes for a single recovery) is met; this is a robustness improvement,
not a correctness fix.

## Acceptance Criteria
- [ ] A second consecutive `recovered` run does not overwrite a `.bak` that
      still differs from the current (default) dest — e.g. timestamped or
      numbered backup, or skip if an identical `.bak` already exists.
- [ ] Single-recovery behavior and all existing tests remain unchanged.
- [ ] A test pins the repeated-corruption case.
