---
title: Thread the implement head SHA through to verification
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
---

## Objective

Thread the implement head SHA through to verification

## Acceptance Criteria

- [ ] The implement stage's head commit SHA is available to buildVerifyPrompt
- [ ] The verify prompt instructs `git checkout --detach <sha>` rather than `git checkout <branch>`
- [ ] No bare branch checkout remains in the verify prompt
- [ ] When no SHA is available the prompt degrades to current behaviour rather than failing
- [ ] Unit tests cover the prompt with and without a SHA

## Technical Context

lib/workflows/sprint_pipeline.js buildVerifyPrompt, around line 1442, currently emits `git checkout ${branch}`. buildImplementPrompt around line 1387 emits `git checkout -b ${branch} ${releaseBranch}` and is NOT the collision — implement creates the branch, verify is the stage locked out of it. The implement stage already returns commit SHAs in its structured result. A branch ref is locked to one worktree; a commit is not, which is why detaching sidesteps the lock entirely. lib/workflows/sprint_pipeline.test.mjs already asserts prompt content structurally — extend it rather than adding a parallel file.
