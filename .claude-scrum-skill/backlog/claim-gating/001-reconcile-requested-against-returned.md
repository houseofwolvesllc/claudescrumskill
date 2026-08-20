---
title: Reconcile requested story IDs against returned results
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

Reconcile requested story IDs against returned results

## Acceptance Criteria

- [ ] The pipeline compares the story IDs it was asked to run against the IDs present in its results
- [ ] Any requested ID absent from the results is reported loudly and named
- [ ] A batch that silently returns fewer results than requested is distinguishable from a completed one
- [ ] Blocked and failed stories count as reported — the comparison is by ID, not by success
- [ ] Unit tests cover the complete set, a truncated set, and a set containing blocked and failed entries

## Technical Context

The pipeline already returns one entry per story; the gap is that nothing compares the returned set against the requested set, so a dropped or truncated batch looks exactly like a completed one. In the reported run an orchestrator dispatched batchB.json[:7] of fourteen stories and reported the epic underway; the user caught it, no tooling did. This is pure bookkeeping over two sets and would have caught both instances at zero cost.
