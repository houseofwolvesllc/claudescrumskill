---
title: Insert Sequential Multi-Path Mode section
epic: sequential-execution
status: done
executor: claude
priority: P1-high
points: 8
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:sequential-execution
persona: impl
blocked_by:
  - dependency-resolution/001
blocks:
  - summary-merged/001
sprint: 4
---

## Objective

Insert the largest new section, "## Sequential Multi-Path Mode", into `skills/project-orchestrate/SKILL.md` (and `.claude/` mirror). Documents the per-spec wrapper loop that invokes the existing single-spec orchestration once per spec in order, with state-file archival, queue state file lifecycle, and safety-gate pause behaviors.

## Acceptance Criteria

- [ ] A new "## Sequential Multi-Path Mode" section is inserted in `skills/project-orchestrate/SKILL.md` after the existing Phase 3 section but before "## Communication Pattern".
- [ ] The section documents the per-spec loop per FR-19 through FR-21: for each spec in resolved execution order, invoke the full single-spec orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) end-to-end before the next spec begins. No interleaving, no parallelism.
- [ ] The section documents the per-spec state file lifecycle per FR-22 through FR-27:
  - During execution, per-spec state file is `.claude-scrum-skill/orchestration-state.md`.
  - On successful completion, archive to `.claude-scrum-skill/orchestration-state-<spec-slug>.previous.md` BEFORE next spec begins.
  - On safety-gate pause without `--skip-on-pause`, state file remains at canonical location with `Status: paused`; queue does not advance.
  - On safety-gate pause with `--skip-on-pause`, archive to `.claude-scrum-skill/orchestration-state-<spec-slug>.skipped.md`; queue advances.
  - Step 17 (state cleanup via `rm -f`) is suppressed in multi-path mode.
  - Single-spec mode state file lifecycle is unchanged from v1.7.1.
- [ ] The section documents the queue state file per FR-28 through FR-32:
  - Path: `.claude-scrum-skill/orchestration-queue-state.md`
  - Created at multi-path mode start, updated after every spec status transition.
  - On clean completion, renamed to `orchestration-queue-state.previous.md`.
  - On paused run, remains in place with `Status: paused`.
  - On startup, the four-case decision table (running / paused / completed / missing) per v1.7.1 autonomous-default style.
  - Includes the full Queue State File markdown template per the "Data Structures" section of the source spec.
- [ ] The section documents the spec slug derivation per "Spec Slug Derivation" in the source spec: `basename(path, ".md")`, with the collision-abort rule.
- [ ] The section documents the safety-gate pause behaviors per FR-24 through FR-25, including the announcement format for both default-pause and `--skip-on-pause` cases.
- [ ] The section documents resume semantics per NFR-4: re-invoking with the same arguments picks up where the queue paused.
- [ ] Both `skills/project-orchestrate/SKILL.md` and `.claude/skills/project-orchestrate/SKILL.md` are updated identically.
- [ ] No content removed from existing sections — additions only.
- [ ] No bot/AI attribution markers added.

## Technical Context

This is the largest new section in the orchestrate skill. It sits at the end of the document because it's a wrapper that invokes the existing per-spec orchestration as a subroutine — readers need to understand Phases 1-3, Step 16, Step 17 before reading the multi-path wrapper.

Source spec sections to consult:
- FR-19 through FR-32
- "Data Structures → Queue State File"
- "Spec Slug Derivation"
- "Architecture → Component Diagram → Per-Spec Loop"
- "User Experience → Safety-Gate Pause (Default Behavior)"
- "User Experience → Safety-Gate Pause with --skip-on-pause"

## Dependencies

- **Blocked by:** dependency-resolution/001 (sequential execution operates on the topologically sorted spec list)
- **Blocks:** summary-merged/001 (Cumulative Summary and Merged Mode subsections live inside this section)
