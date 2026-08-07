---
title: Remove the redundant self-check sentence from buildReviewPrompt
epic: verification-deduplication
status: backlog
executor: claude
priority: P2-medium
points: 1
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:verification-deduplication
persona: impl
---

## Objective

Remove the redundant self-check sentence from buildReviewPrompt

## Acceptance Criteria

- [ ] The sentence beginning 'Confirm the baseline was honored' is removed from buildReviewPrompt in sprint_pipeline.js
- [ ] The baselinePath reference in the preceding clause is retained so the reviewer still knows where the baseline lives
- [ ] No replacement verification phrasing is introduced

## Technical Context

sprint_pipeline.js:480. The same prompt already asks for correctness and convention-compliance review; the extra sentence is a second verify instruction inside one prompt.
