---
title: Update affected SKILL.md "Before You Start" / "Input" sections
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
  - foundation/004
  - orchestrate-integration/001
blocks:
  - documentation-verification/003
sprint: null
---

## Objective

Update each affected SKILL.md to document the new flags, frontmatter fields, and behaviors in their "Before You Start" and "Input" sections, so users discover the new controls at the point they invoke each skill.

## Acceptance Criteria

- [ ] `skills/project-scaffold/SKILL.md` "Input" section documents:
  - PRD frontmatter fields: `scaffold_mode: single-pass | two-pass`, `design_spike: true | false`
  - CLI flags: `--mode two-pass`, `--design-spike`, equivalents to suppress
- [ ] `skills/project-scaffold/SKILL.md` "Before You Start" mentions reading the new config keys (`scaffold.two_pass_threshold_words`, `scaffold.design_spike_enabled`, `paths.context`) and falling back to defaults when missing
- [ ] `skills/project-orchestrate/SKILL.md` "Before You Start" mentions that orchestration honors design-spike epic gating (no implementation work begins until design-spike completes)
- [ ] `skills/project-orchestrate/SKILL.md` Step 3 subagent prompt section briefly mentions the CONTEXT.md read instruction so the integration is discoverable in-place
- [ ] Both copies (`skills/` and `.claude/skills/`) of each affected SKILL.md updated identically
- [ ] No content removed — additions and minor edits only
- [ ] No bot/AI attribution markers

## Technical Context

This story is the "discoverability layer" — it ensures users who land on a SKILL.md file see the new controls without having to read the source spec or the README. Keep additions concise; reference the README / CONVENTIONS.md for deep detail rather than duplicating content.

Files to touch (each in two locations):
- `skills/project-scaffold/SKILL.md` and `.claude/skills/project-scaffold/SKILL.md`
- `skills/project-orchestrate/SKILL.md` and `.claude/skills/project-orchestrate/SKILL.md`

The README itself is updated by the sibling story (documentation-verification/002).

## Dependencies

- **Blocked by:** foundation/004 (CONVENTIONS.md must already document the new conventions before SKILL.md cross-references them), orchestrate-integration/001 (orchestrate Step 3 must already mention CONTEXT.md before the discoverability blurb references it)
- **Blocks:** documentation-verification/003
