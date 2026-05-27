---
title: Update project-orchestrate Step 3 prompt, Step 16 ADR numbering, Step 2 gate
epic: orchestrate-integration
status: done
executor: claude
priority: P1-high
points: 5
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:orchestrate-integration
persona: impl
blocked_by:
  - foundation/002
  - foundation/003
  - design-spike-epic/002
blocks:
  - documentation-verification/001
  - documentation-verification/002
sprint: 3
---

## Objective

Apply three coordinated updates to `skills/project-orchestrate/SKILL.md` (and the `.claude/` mirror): update the Step 3 subagent prompt template to instruct subagents to read CONTEXT.md, update the Step 16 ADR creation to compute the next sequential number from existing ADRs, and verify (adding an explicit gate if necessary) that Step 2 sprint planning honors `blocked_by` so implementation epics wait for design-spike completion.

## Acceptance Criteria

- [ ] Step 3 (Story Execution) subagent prompt template is updated to include, after the CLAUDE.md instruction: "Before writing any code, if `<paths.context>/<epic-slug>/CONTEXT.md` exists, read it in full. Treat its naming, file layout, types, and patterns sections as binding for this epic — they override generic conventions in CLAUDE.md when in conflict, and you should follow them even when CLAUDE.md is silent."
- [ ] The `<paths.context>` and `<epic-slug>` placeholders in the new instruction reference the actual resolved values at subagent-spawn time, not literal placeholder strings
- [ ] Step 16 (ADR Update) is updated to: "Read all existing ADRs in `<paths.adr>` first. Compute the next sequential ADR number as `max(existing_numbers) + 1`. This number is used regardless of whether prior ADRs were created by the design-spike epic in this run, prior orchestration runs, or hand-authored — they all share a single sequential pool."
- [ ] Step 2 (Sprint Planning) is reviewed for its existing `blocked_by` handling. If the existing instructions already honor story-level `blocked_by` such that no implementation story enters a sprint while its design-spike blockers are open, no change required — verify this is documented. Otherwise add explicit text: "Before selecting stories for the sprint, exclude any story whose `blocked_by` list contains an open (not yet `done`) story. This naturally gates implementation epics on the design-spike epic when it exists."
- [ ] Both copies of project-orchestrate/SKILL.md updated identically
- [ ] No bot/AI attribution markers

## Technical Context

The current Step 3 subagent prompt structure (in the Subagent prompt structure block) currently says:

```
**IMPORTANT:** First read the project's CLAUDE.md file if it exists, and
follow all instructions in it. CLAUDE.md is authoritative for stack,
patterns, and style — it overrides any general guidance in this preamble.
```

The new instruction should be inserted as an additional bullet/paragraph at that position, before the Story/Acceptance criteria/Branch strategy block.

Step 16 currently says:
```
1. Read all existing ADRs in the configured ADR directory to understand what's
   already documented and the numbering/format convention in use.
```

That's already correct — it just needs explicit affirmation that the number assignment doesn't reset between design-spike ADRs and Step 16 retrospective ADRs.

Step 2 currently delegates to `/sprint-plan` for the actual selection. Verify that the existing sprint-plan skill honors `blocked_by` (read `skills/sprint-plan/SKILL.md` to confirm). If yes, just add a one-line affirmation in Step 2 of orchestrate. If no, add the explicit exclusion text to Step 2 itself.

## Dependencies

- **Blocked by:** foundation/002 (CONTEXT template — Step 3 references it), foundation/003 (ADR template — Step 16 numbering), design-spike-epic/002 (design-spike artifacts must exist by the time Step 3/16 reference them)
- **Blocks:** documentation-verification/001, documentation-verification/002
