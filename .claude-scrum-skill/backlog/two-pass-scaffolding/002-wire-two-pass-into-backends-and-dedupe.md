---
title: Wire two-pass into per-backend procedures and add slug deduplication
epic: two-pass-scaffolding
status: backlog
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:two-pass-scaffolding
  - ready-for-work
persona: impl
blocked_by:
  - two-pass-scaffolding/001
blocks:
  - design-spike-epic/001
sprint: null
---

## Objective

Update each per-backend procedure (Local, GitHub, Jira, Trello) in `project-scaffold/SKILL.md` to delegate to the Two-Pass Procedure when triggered, and add slug-deduplication logic to the story assembly step so parallel Pass 2 subagents that produce colliding story slugs resolve cleanly.

## Acceptance Criteria

- [ ] Local Step 1 ("Parse the PRD") is updated to: "When two-pass mode is triggered (see Mode Detection), follow the Two-Pass Procedure to produce the skeleton + stories before continuing to Step 2. Otherwise, parse the PRD in a single pass as before."
- [ ] GitHub Step 1, Jira Step 1, and Trello Step 1 receive the equivalent update
- [ ] Each backend's per-story creation step (Local Step 5, GitHub Step 5, Jira Step 4, Trello Step 5) is updated to note that the story list it iterates over comes from either single-pass output or two-pass output — same shape either way
- [ ] A "Story Assembly" subsection is added at the end of the Two-Pass Procedure section describing slug deduplication: detect duplicate slugs across Pass 2 outputs by exact string match, resolve by prepending the epic slug (`<epic-slug>-<original-slug>`), log the rename in skill output
- [ ] Both copies of project-scaffold/SKILL.md updated identically
- [ ] No bot/AI attribution markers

## Technical Context

The per-backend procedures have these "Parse" entry points to update:
- Local Procedure → Local Step 1
- GitHub Procedure → Step 1 (the procedure has Steps 0-9; Step 1 is "Parse the PRD")
- Jira Procedure → Jira Step 1
- Trello Procedure → Trello Step 1

After Pass 2 produces per-epic story lists, the assembly step combines them and hands off to the backend's existing issue/file creation logic. The shape of "stories to create" is identical to what single-pass would produce, so the creation steps need only a one-line note that the source can be either path.

Slug collision detection happens at assembly time: gather all stories from all Pass 2 outputs, group by slug, identify any group with > 1 member, rename all-but-first by prepending the epic slug, emit a log line per rename so the user sees the resolution.

## Dependencies

- **Blocked by:** two-pass-scaffolding/001
- **Blocks:** design-spike-epic/001
