---
title: Insert Input Parsing and Mode Detection section into project-orchestrate
epic: mode-detection
status: done
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:mode-detection
persona: impl
blocked_by:
  - foundation/001
blocks:
  - dependency-resolution/001
sprint: 2
---

## Objective

Insert a new "Input Parsing and Mode Detection" section into `skills/project-orchestrate/SKILL.md` (and the `.claude/` mirror) between the existing "Input" and "State Management" sections. The section covers the seven mode-classification cases, the announcement format, flag parsing (`--skip-on-pause`, `--merged`), and glob detection / expansion.

## Acceptance Criteria

- [ ] A new "## Input Parsing and Mode Detection" section is inserted between "## Input" and "## State Management" in `skills/project-orchestrate/SKILL.md`.
- [ ] The section documents the seven invocation patterns per FR-1 through FR-6:
  - All args resolve to existing files (2+) → **sequential multi-path mode**
  - Exactly one arg is a path to an existing file → existing single-spec mode (unchanged)
  - Exactly one arg is non-path → existing repo-identifier mode (unchanged)
  - Two args, one path + one non-path → existing PRD-path + repo-identifier mode (unchanged)
  - Zero args → existing no-arg mode (unchanged)
  - 2+ args with mixed path/non-path → **abort with FR-6 error** listing which tokens are paths and which are not
  - Glob characters detected in $ARGUMENTS → expand glob, then re-classify (FR-7)
- [ ] The section documents flag parsing for `--skip-on-pause` (default off) and `--merged` (default off), including the unknown-flag abort rule (FR-12).
- [ ] The section requires the chosen mode and (for multi-path) the count of specs to be announced before any orchestration work begins (FR-8). Includes example announcement text for each mode.
- [ ] The section explicitly notes that `--skip-on-pause` and `--merged` are orthogonal — either, both, or neither (FR-11).
- [ ] Both `skills/project-orchestrate/SKILL.md` and `.claude/skills/project-orchestrate/SKILL.md` are updated identically.
- [ ] No content removed from existing sections — additions only.
- [ ] No bot/AI attribution markers added.

## Technical Context

This story does NOT implement dependency resolution (that's `dependency-resolution/001` next) — it only covers the mode classification, flag parsing, and announcement. Reserve the spot for the Dependency Resolution subsection by mentioning it forward-referenced: "When multi-path mode is selected, see the Dependency Resolution subsection (added next) for ordering rules."

Source spec sections to consult:
- "Functional Requirements → Mode Detection (Input Parsing)" — FR-1 through FR-8
- "Functional Requirements → Flag Parsing" — FR-9 through FR-12
- "User Experience" — announcement examples
- "Architecture → Component Diagram" — classification routing

Per CLAUDE.md, no bot/AI attribution markers in any added content.

## Dependencies

- **Blocked by:** foundation/001 (CONVENTIONS.md documents `depends_on` field that the new section references)
- **Blocks:** dependency-resolution/001 (the Dependency Resolution subsection lives inside this section)
