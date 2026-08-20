---
title: Add an artifact freshness helper
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
---

## Objective

Add an artifact freshness helper

## Acceptance Criteria

- [ ] A _shared/ module compares a phase start timestamp against an artifact mtime and reports whether the artifact is fresh
- [ ] A missing artifact is not fresh
- [ ] An artifact whose mtime predates the phase start is not fresh
- [ ] The comparison is pure and unit-testable without touching a filesystem
- [ ] The module is registered in inline_manifest.mjs and inline_sync.test.mjs passes
- [ ] Unit tests cover fresh, stale, missing, and unmeasured-timestamp cases

## Technical Context

Follow the established _shared/ convention — plain functions over constants, no classes, per the Arbitration Rule and the shape of resolve_dependency_strategy.mjs and resolve_agent_tier.mjs. The runtime cannot stat a file itself, so the mtime arrives as data from an agent-delegated probe exactly as repo layout facts do; this module owns only the comparison. An unmeasured timestamp must be treated as not fresh, failing closed.
