---
title: Add Cumulative Summary and Merged Mode subsections
epic: summary-merged
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:summary-merged
  - ready-for-work
persona: impl
blocked_by:
  - sequential-execution/001
blocks:
  - documentation-release/001
sprint: null
---

## Objective

Add the "Cumulative Summary" and "Merged Mode (Opt-In)" subsections inside the new Sequential Multi-Path Mode section. The summary covers the end-of-run report; merged mode accepts `--merged` and falls through to legacy best-effort behavior with a deprecation warning.

## Acceptance Criteria

- [ ] A "### Cumulative Summary" subsection is added to the end of the Sequential Multi-Path Mode section in `skills/project-orchestrate/SKILL.md`.
- [ ] The subsection documents per FR-33 the summary structure: per-spec sections plus aggregate header (specs in queue, completed count, paused/skipped counts, total stories, total points, total sprints, total ADRs, total duration).
- [ ] Includes the full example summary markdown per the "User Experience → Cumulative Summary" section of the source spec.
- [ ] A "### Merged Mode (Opt-In)" subsection is added documenting that `--merged` accepts the multi-path arguments and treats them as one combined project using legacy best-effort behavior.
- [ ] The Merged Mode subsection includes the deprecation warning text per FR-10 noting that formal merged semantics are deferred to a follow-up spec.
- [ ] Both `skills/project-orchestrate/SKILL.md` and `.claude/skills/project-orchestrate/SKILL.md` are updated identically.
- [ ] No content removed — additions only.
- [ ] No bot/AI attribution markers added.

## Technical Context

Both subsections sit inside the Sequential Multi-Path Mode section (added by `sequential-execution/001`). The Cumulative Summary appears at the very end of the section. The Merged Mode subsection appears just before the Cumulative Summary or as a sibling — either ordering is acceptable.

Source spec sections to consult:
- FR-33 (cumulative summary structure)
- "User Experience → Cumulative Summary" (full example)
- FR-10 (merged mode deprecation warning)
- "User Experience → --merged Flag (Opt-In, Deferred Semantics)" (warning example text)

## Dependencies

- **Blocked by:** sequential-execution/001 (these subsections live inside the section added there)
- **Blocks:** documentation-release/001 (CHANGELOG and version bump come after all SKILL.md content is in place)
