---
title: Add CONTEXT.md/ADR reference auto-injection and idempotency check
epic: design-spike-epic
status: done
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:design-spike-epic
persona: impl
blocked_by:
  - design-spike-epic/001
blocks:
  - orchestrate-integration/001
sprint: 3
---

## Objective

Complete the Design-Spike Epic feature by adding two pieces to `project-scaffold/SKILL.md`: (1) auto-injection of a `See <epic-slug>/CONTEXT.md and ADR-NNNN ...` reference into every implementation story's Technical Context, and (2) an idempotency check that skips design-spike creation when scaffolding into a project that already has a design-spike epic.

## Acceptance Criteria

- [ ] The Design-Spike Epic section in `project-scaffold/SKILL.md` documents the auto-injection rule: when design-spike is created, every implementation story's Technical Context section receives an appended line `See [.claude-scrum-skill/context/<epic-slug>/CONTEXT.md] and [<paths.adr>/NNNN-<slug>.md] for shared architectural decisions.` (using the configured `paths.context` and `paths.adr` values, not hardcoded paths)
- [ ] The auto-injection occurs during the Story Assembly step, after Pass 2 produces stories but before backend creation
- [ ] The Design-Spike Epic section documents the idempotency check: when scaffolding into an existing project, detect whether a design-spike epic already exists (by label `type:design-spike` or frontmatter `epic_type: design-spike`); if so, skip creation and reuse the existing one for `blocked_by` references
- [ ] The idempotency check works in all four backends — local mode checks `_epic.md` frontmatter, GitHub mode checks milestone/issue labels, Jira mode checks issue labels, Trello mode checks list labels/title
- [ ] Both copies of project-scaffold/SKILL.md updated identically
- [ ] No bot/AI attribution markers

## Technical Context

The auto-injection produces a single appended line in each implementation story's Technical Context section. The path values come from the resolved `paths.context` and `paths.adr` config keys at scaffold time, not hardcoded. The ADR number is the number assigned to the design-spike epic's foundational ADR (determinable at scaffold time by reading the existing ADR sequence and incrementing).

Idempotency rationale: re-running scaffold on an existing project must not create a duplicate design-spike epic. Detection by label/field is robust to renames and works across backends.

Per NFR-2 of the source spec, an in-flight orchestration (state file with `Status: running` or `Status: paused`) must NOT have a design-spike epic retroactively injected. This is enforced by scope: design-spike injection only happens during `/project-scaffold`, never during `/project-orchestrate` resume. No additional check needed here — the boundary is the skill boundary.

## Dependencies

- **Blocked by:** design-spike-epic/001
- **Blocks:** orchestrate-integration/001
