---
title: Add a structural test forbidding untiered agent calls
epic: agent-tiering
status: backlog
executor: claude
priority: P2-medium
points: 2
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:agent-tiering
persona: impl
blocked_by:
  - agent-tiering/002
---

## Objective

Add a structural test forbidding untiered agent calls

## Acceptance Criteria

- [ ] A test scans lib/workflows/*.js and fails if any agent() call omits an explicit tier
- [ ] The test names the offending file and stage in its failure message
- [ ] The test passes against the post-change tree

## Technical Context

Prevents regression: the original defect was silent inheritance, which no existing test would catch.
