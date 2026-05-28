---
title: Document multi-path invocation pattern in README
epic: foundation
status: done
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:foundation
persona: impl
blocked_by: []
blocks:
  - documentation-release/001
sprint: 1
---

## Objective

Document the new multi-path invocation pattern in `README.md` so users discover the simplest call form (`/project-orchestrate spec-1.md spec-2.md spec-3.md`) without reading the source spec or SKILL.md.

## Acceptance Criteria

- [ ] The Autonomous Orchestration section (around §317-329) is updated to mention multi-path invocation: passing multiple PRD paths runs each spec end-to-end sequentially, each with its own design-spike / emulation / cleanup / ADR.
- [ ] A new sub-section or callout documents the four invocation patterns:
  - `/project-orchestrate` — orchestrate open epics in the existing backlog
  - `/project-orchestrate spec.md` — single-spec, full lifecycle
  - `/project-orchestrate spec-1.md spec-2.md spec-3.md` — sequential per-spec lifecycle (the new behavior)
  - `/project-orchestrate --merged spec-1.md spec-2.md` — opt-in merged behavior (with note that semantics are deferred to a follow-up spec)
- [ ] A brief example of `depends_on` PRD frontmatter is shown, with cross-reference to CONVENTIONS.md for the full definition.
- [ ] The `--skip-on-pause` flag is documented with its default-off semantics and the warning that silent-skipping risks shipping broken work.
- [ ] The Tips section gains a tip about author-controlled ordering via `depends_on` for related specs.
- [ ] No bot/AI attribution markers added.

## Technical Context

The README has an "Autonomous Orchestration" section that currently documents single-spec/repo-id/no-arg invocation. Add multi-path coverage there. Keep additions concise — cross-reference the source spec and SKILL.md for deep detail rather than duplicating.

## Dependencies

- **Blocked by:** none
- **Blocks:** documentation-release/001 (final docs cleanup verifies README + SKILL.md inputs are in sync)
