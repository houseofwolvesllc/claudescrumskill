---
title: Update CONVENTIONS.md with new label, field, and design-spike workflow
epic: foundation
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:foundation
  - ready-for-work
persona: impl
blocked_by: []
blocks:
  - documentation-verification/001
  - documentation-verification/002
sprint: null
---

## Objective

Document the new `type:design-spike` label, `epic_type` frontmatter field, `paths.context` path convention, and design-spike epic workflow in `skills/shared/references/CONVENTIONS.md` so the conventions document remains the single source of truth for all PM skills.

## Acceptance Criteria

- [ ] `Type Labels` section adds `type:design-spike — Research-driven epic that produces design artifacts (ADR + CONTEXT.md files) consumed by implementation epics`
- [ ] A new section "Frontmatter Fields (Local Mode)" documents the `epic_type` field in `_epic.md` with allowed value `design-spike` (and the absence-means-implementation default)
- [ ] A new section under `Epic Structure` titled "Design-Spike Epic" describes:
  - When it auto-injects (multi-epic two-pass scaffold, or explicit `design_spike: true` PRD frontmatter)
  - What it contains (ADR-authoring story + one CONTEXT.md-authoring story per implementation epic, all `persona: research`)
  - How it gates implementation (implementation stories `blocked_by` the design-spike stories)
  - Where artifacts live (`paths.adr` for ADRs, `paths.context/<epic-slug>/CONTEXT.md` for context files)
- [ ] The conventions doc mentions `paths.context` alongside the existing `paths.adr` / `paths.backlog` / `paths.specs` references
- [ ] Both `skills/shared/references/CONVENTIONS.md` and `.claude/skills/shared/references/CONVENTIONS.md` are updated identically
- [ ] No content is deleted from CONVENTIONS.md — additions only
- [ ] No bot/AI attribution markers added

## Technical Context

Two copies of CONVENTIONS.md exist in the repo:
- `skills/shared/references/CONVENTIONS.md` (npm-shipped)
- `.claude/skills/shared/references/CONVENTIONS.md` (local development)

The existing structure has top-level sections: GitHub Project Structure, Label Taxonomy, Branch Strategy, Issue Template, Epic Structure, Sprint Cadence, Story Point Guidelines, Executor Assignment Guidelines.

Insert the new `type:design-spike` row into the existing "Type Labels" list (after `type:chore` is fine — alphabetic order isn't strictly enforced; group with infrastructure-adjacent types).

Insert the "Design-Spike Epic" subsection inside the existing `Epic Structure` H2, after the "Backward compatibility" paragraph.

Insert the new "Frontmatter Fields (Local Mode)" H2 just before `Sprint Cadence` (so it sits alongside the existing project-management metadata sections rather than the GitHub-specific ones).

## Dependencies

- **Blocked by:** none
- **Blocks:** documentation-verification/001, documentation-verification/002
