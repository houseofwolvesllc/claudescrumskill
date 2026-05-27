---
title: Add Design-Spike Epic section and skeleton augmentation to project-scaffold
epic: design-spike-epic
status: backlog
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:design-spike-epic
  - ready-for-work
persona: impl
blocked_by:
  - foundation/002
  - foundation/003
  - two-pass-scaffolding/002
  - two-pass-scaffolding/003
blocks:
  - design-spike-epic/002
sprint: null
---

## Objective

Insert a "Design-Spike Epic" section into `project-scaffold/SKILL.md` describing the trigger heuristics, the epic's contents (ADR + per-implementation-epic CONTEXT.md stories), and how it augments the Two-Pass skeleton by injecting itself at position 0 with `blocked_by` dependencies wired into implementation stories.

## Acceptance Criteria

- [ ] A new "Design-Spike Epic" section is added to `project-scaffold/SKILL.md` after the Two-Pass Procedure section
- [ ] The section documents trigger evaluation: PRD frontmatter `design_spike: true/false` (explicit override wins) → CLI flag → auto-trigger when two-pass mode was triggered AND Pass 1 produced > 1 implementation epic
- [ ] The section documents `scaffold.design_spike_enabled` config key as the global enable switch (default `true`)
- [ ] The section documents what the design-spike epic contains: one ADR-authoring story (`persona: research`, `executor: claude`) producing `<paths.adr>/NNNN-<slug>.md`, plus one CONTEXT.md-authoring story per implementation epic (`persona: research`, `executor: claude`) producing `<paths.context>/<epic-slug>/CONTEXT.md`
- [ ] The section documents the canonical detection signals: label `type:design-spike` (GitHub/Trello), `epic_type: design-spike` in `_epic.md` frontmatter (local), equivalent Jira label
- [ ] The section documents the position-0 injection: design-spike epic is prepended to the skeleton's epics list before per-backend creation runs
- [ ] The section documents how `blocked_by` references are wired: each implementation epic's first story gets `blocked_by` references to the design-spike stories that produce its CONTEXT.md (sprint planning then naturally cascades the gate)
- [ ] The section documents artifact storage: ADR + CONTEXT.md files are committed to the `development` branch via filesystem in ALL four backends (git is the universal substrate); remote backends additionally surface links via milestone/epic descriptions but the committed files are the single source of truth
- [ ] Both copies of project-scaffold/SKILL.md updated identically
- [ ] No bot/AI attribution markers

## Technical Context

Source spec sections to consult:
- FR-9 through FR-15 (functional requirements for design-spike)
- Architecture → Component Diagram and Data Flow (steps 4-5)
- Technical Specifications (CONTEXT.md location convention)

The design-spike injection happens AFTER Pass 1 produces the skeleton but BEFORE Pass 2 spawns. Conceptually:

```
Pass 1 → skeleton (N implementation epics)
  ↓
Design-Spike Trigger? → if yes, prepend design-spike epic at position 0 with N+1 stories
  ↓                     (1 ADR story + N CONTEXT.md stories)
Pass 2 → spawn subagents for ALL epics including design-spike
  ↓
Story Assembly → also wires blocked_by from impl epic stories to design-spike stories
  ↓
Backend creation
```

The Default epic title is "Architecture & Design" but the canonical detection signal is the label / `epic_type` field, NOT the title (per FR-12). Detection by label/field means future renames are safe.

This story handles the section authoring + the skeleton augmentation logic. The next story (design-spike-epic/002) handles the per-implementation-story Technical Context auto-injection + the idempotency check on re-scaffolding.

## Dependencies

- **Blocked by:** foundation/002 (CONTEXT template referenced in design-spike stories), foundation/003 (ADR template), two-pass-scaffolding/002 (this section sits alongside the Two-Pass Procedure), two-pass-scaffolding/003 (failure handling section established first so design-spike section matches its style)
- **Blocks:** design-spike-epic/002
