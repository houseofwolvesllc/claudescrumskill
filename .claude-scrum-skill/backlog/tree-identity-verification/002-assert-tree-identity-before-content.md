---
title: Assert tree identity before reporting content
epic: tree-identity-verification
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:tree-identity-verification
persona: impl
blocked_by:
  - tree-identity-verification/001
---

## Objective

Assert tree identity before reporting content

## Acceptance Criteria

- [ ] The verify prompt requires confirming `git rev-parse HEAD` equals the supplied SHA before reporting on any file
- [ ] On mismatch the agent reports a tree-identity failure and stops rather than reporting on content
- [ ] The tree-identity failure maps to the existing infrastructure-failed status, not a new one
- [ ] A content finding is distinguishable from a tree-identity failure in the returned data
- [ ] Unit tests cover the match path, the mismatch path, and the no-SHA path

## Technical Context

This is the requirement that makes 'empty' and 'unreachable' structurally distinct rather than a matter of agent phrasing. In the reported run agents said 'src/ is completely empty' when the true condition was 'I cannot read the tree I was pointed at', and that single ambiguity turned one incident into twelve because it sent the orchestrator hunting a story that had failed to write files. infrastructure-failed was added in 2.4.0 for exactly this category: a harness placement error is not a code failure.
