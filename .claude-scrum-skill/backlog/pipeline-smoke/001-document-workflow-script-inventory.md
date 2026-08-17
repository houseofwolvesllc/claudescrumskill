---
title: Document the current workflow script inventory in the README
epic: pipeline-smoke
status: backlog
executor: claude
priority: P3-low
points: 1
labels:
  - type:docs
  - executor:claude
  - P3-low
  - epic:pipeline-smoke
persona: impl
---

## Objective

The README's "Workflow scripts shipped in v2.0.0" section still lists four
scripts. `review_panel.js` was deleted, so it now lists a file that does not
exist.

## Acceptance Criteria

- [ ] The README's workflow-script list matches the files actually present in `lib/workflows/`
- [ ] No reference to `review_panel.js` remains in README.md
- [ ] The section heading is accurate for the current version
