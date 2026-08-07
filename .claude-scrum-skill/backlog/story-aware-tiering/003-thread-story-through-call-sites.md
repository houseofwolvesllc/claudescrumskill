---
title: Thread the story through the pipeline call sites and re-inline
epic: story-aware-tiering
status: backlog
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:story-aware-tiering
persona: impl
blocked_by:
  - story-aware-tiering/002
---

## Objective

Thread the story through the pipeline call sites and re-inline

## Acceptance Criteria

- [ ] sprint_pipeline passes the story being worked to resolveAgentTier at the implement, review, and verify call sites
- [ ] Stages with no story context continue to resolve correctly
- [ ] adversarial_verify and elaborate_epics call sites still work with no story supplied
- [ ] All three inlined copies match the canonical module and inline_sync.test.mjs passes
- [ ] The full suite passes

## Technical Context

The Workflow runtime cannot import across files, so the resolver is inlined into each script and kept in sync by inline_sync.test.mjs via inline_manifest.mjs. A signature change means re-inlining all three copies. sprint_pipeline already has the story object in scope at the per-story call sites; detect-layout and reset are batch-level and have no story.
