---
title: Carry the observed SHA in the verify return
epic: tree-identity-verification
status: backlog
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:tree-identity-verification
persona: impl
blocked_by:
  - tree-identity-verification/002
---

## Objective

Carry the observed SHA in the verify return

## Acceptance Criteria

- [ ] The verify return schema carries the SHA the agent actually observed
- [ ] A mismatch between assigned and observed SHA is visible in structured data, not only in prose
- [ ] test/probe_schema_coverage.test.js passes with the new field
- [ ] The field is threaded and consumed, not merely declared in the schema
- [ ] Unit tests assert the field is populated on both the match and mismatch paths

## Technical Context

Prose is not checkable; structured data is. The recurring defect in this codebase is a value consumed that nothing provides — sessionModel in 2.3.0, viableProvisioning in 2.4.0, copyOnWriteSupported in 2.5.0 — each undefined in production while unit tests passed, because unit tests pass the value directly. The static guard added in 2.5.0 catches the declared-but-unsupplied direction; the inverse, supplied-but-unread, is what this criterion guards against by requiring the field be consumed.
