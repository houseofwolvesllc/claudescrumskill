---
title: Create synthetic PRD fixtures and verify end-to-end behavior
epic: documentation-verification
status: backlog
executor: claude
priority: P2-medium
points: 3
labels:
  - type:story
  - executor:claude
  - P2-medium
  - epic:documentation-verification
  - ready-for-work
persona: impl
blocked_by:
  - documentation-verification/001
  - documentation-verification/002
blocks: []
sprint: null
---

## Objective

Create two synthetic PRD fixtures under `docs/specs/_fixtures/` (a small single-epic PRD and a large multi-epic PRD) and document the verification matrix from the source spec's Testing Strategy section. The fixtures themselves are checked in; the actual end-to-end test runs are performed manually by the user post-merge.

## Acceptance Criteria

- [ ] `docs/specs/_fixtures/small_prd.md` exists: single epic, approximately 2000 words, intentionally below the two-pass word threshold
- [ ] `docs/specs/_fixtures/large_prd.md` exists: 3+ epics, approximately 8000 words, with explicit cross-cutting concerns (shared types, naming, file layout) that the design-spike epic should lift into an ADR/CONTEXT.md
- [ ] `docs/specs/_fixtures/README.md` exists documenting the verification matrix (9 cases) from the source spec's Testing Strategy section and how to run each verification case
- [ ] Both fixtures are structurally complete PRDs (with epics, stories, acceptance criteria) so they can actually be scaffolded — they are not placeholder stubs
- [ ] The verification README explicitly notes which cases require manual user invocation (e.g., the "state-file resume" case) versus which can run cleanly in a fresh shell
- [ ] No bot/AI attribution markers

## Technical Context

The Testing Strategy section of the source spec enumerates 9 verification cases:
1. Small PRD, no overrides → single-pass, no design-spike
2. Large PRD, no overrides → two-pass + design-spike
3. Small PRD with `scaffold_mode: two-pass` frontmatter → forced two-pass, no design-spike (single epic)
4. Large PRD with `design_spike: false` → two-pass, no design-spike, no Technical Context injection
5. Re-scaffold existing project → skip design-spike, no duplicate
6. Pass 1 failure simulated → retry once then fallback
7. Slug collision across Pass 2 subagents → dedup by prepending epic slug
8. State-file resume → no retroactive design-spike injection
9. Backend parity → identical filesystem paths across local/GitHub/Jira/Trello

The small/large fixtures cover cases 1-4 directly. Cases 5-9 require additional setup the fixtures should document but not necessarily encode (some are hand-tested with crafted state).

This story does NOT execute the verification runs (those happen post-merge by the user). It only ensures the artifacts to verify against exist and are documented.

## Dependencies

- **Blocked by:** documentation-verification/001, documentation-verification/002
- **Blocks:** none
