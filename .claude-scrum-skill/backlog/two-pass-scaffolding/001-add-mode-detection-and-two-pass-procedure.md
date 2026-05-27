---
title: Add Mode Detection step and Two-Pass Procedure section to project-scaffold
epic: two-pass-scaffolding
status: done
executor: claude
priority: P1-high
points: 8
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:two-pass-scaffolding
persona: impl
blocked_by:
  - foundation/001
  - foundation/002
blocks:
  - two-pass-scaffolding/002
  - two-pass-scaffolding/003
sprint: 2
---

## Objective

Insert two new sections into `skills/project-scaffold/SKILL.md` (and mirror to `.claude/skills/project-scaffold/SKILL.md`): a "Mode Detection" step that decides single-pass vs two-pass based on trigger heuristics, and a backend-agnostic "Two-Pass Procedure" section that defines Pass 1 (skeleton extraction) and Pass 2 (per-epic elaboration subagents). This is the largest single edit in the scaffold skill.

## Acceptance Criteria

- [ ] A new "Mode Detection" section is inserted into `skills/project-scaffold/SKILL.md` between "Before You Start" and the per-backend procedures
- [ ] The Mode Detection section documents trigger evaluation order: PRD frontmatter override (`scaffold_mode: single-pass` or `two-pass`) → CLI flag → word count threshold from `scaffold.two_pass_threshold_words` config (default 5000)
- [ ] Mode Detection section requires the skill to announce the decision and reasoning to the user before proceeding (per the User Experience section of the source spec)
- [ ] A new "Two-Pass Procedure" section is inserted after Mode Detection
- [ ] Two-Pass Procedure documents Pass 1: emits a structured skeleton manifest with the exact YAML shape specified in source spec Technical Specifications (project name/description, global_preamble, non_functional_requirements, epics list with name/slug/description/slice.start_line/slice.end_line/depends_on/shared_design_concerns)
- [ ] Two-Pass Procedure documents Pass 2: spawn one subagent per epic, max 3 concurrent, each subagent receives global preamble + own slice + skeleton summary of siblings, produces stories with full acceptance criteria, points, executor/persona/labels, dependencies
- [ ] Two-Pass Procedure documents the auto-downgrade rule: if Pass 1 produces ≤ 2 epics, fall back to single-pass Pass 2 (one subagent handles all epics)
- [ ] Mirror the same edits in `.claude/skills/project-scaffold/SKILL.md`
- [ ] No content removed from project-scaffold — additions only
- [ ] No bot/AI attribution markers

## Technical Context

Two copies of project-scaffold/SKILL.md exist:
- `skills/project-scaffold/SKILL.md` (npm-shipped)
- `.claude/skills/project-scaffold/SKILL.md` (local development)

Both must be edited identically.

The Two-Pass Procedure is backend-agnostic: it runs before the per-backend creation logic. The per-backend procedures (Local/GitHub/Jira/Trello) are wired in by the NEXT story (two-pass-scaffolding/002) — this story only adds the procedure itself.

Source spec sections to consult while implementing:
- FR-1 through FR-8 (functional requirements for two-pass)
- User Experience → Trigger Visibility (announcement format)
- Technical Specifications → Pass 1 skeleton manifest shape
- Architecture → Data Flow (steps 1-3)

Place the new sections so the reading order is: Before You Start → Mode Detection → Two-Pass Procedure → per-backend procedures (Local/Jira/Trello/GitHub). The per-backend procedures' Step 1 (Parse the PRD) is what gets replaced by Mode Detection → Two-Pass when triggered; this story does not yet modify the per-backend procedures themselves.

## Dependencies

- **Blocked by:** foundation/001 (config keys), foundation/002 (CONTEXT template — Pass 2 stories reference it)
- **Blocks:** two-pass-scaffolding/002, two-pass-scaffolding/003
