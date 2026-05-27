---
title: Add Pass 1 and Pass 2 retry + fallback logic
epic: two-pass-scaffolding
status: backlog
executor: claude
priority: P1-high
points: 3
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

Add resilience instructions to the Two-Pass Procedure: Pass 1 retries once then falls back to single-pass; Pass 2 retries once per failed subagent then marks the affected epic's stories as `status: needs-context` without halting sibling subagents.

## Acceptance Criteria

- [ ] A "Failure Handling" subsection is added to the Two-Pass Procedure section in `project-scaffold/SKILL.md`
- [ ] Pass 1 failure rule: retry once with identical input. If second attempt fails, log the failure and fall back to single-pass scaffolding (the original per-backend Parse the PRD step). User is notified of the fallback in skill output.
- [ ] Pass 2 failure rule: retry the failed subagent once with the original prompt + failure context appended. If second attempt fails, write the affected epic's epic-level metadata but mark all its proposed stories with `status: needs-context` and include a note explaining the Pass 2 failure. Sibling Pass 2 subagents continue.
- [ ] Skill output explicitly surfaces both retry attempts and final outcome (success / fallback / needs-context) so the user knows what landed cleanly vs degraded
- [ ] Both copies of project-scaffold/SKILL.md updated identically
- [ ] No bot/AI attribution markers

## Technical Context

Per NFR-3 of the source spec, scaffold must not abort on Pass 1 or Pass 2 failure — it must degrade gracefully.

The "Pass 1 falls back to single-pass" path means the SAME backend's existing Parse the PRD step runs as if two-pass had never been triggered. The user-facing announcement should clearly say "Pass 1 failed twice; falling back to single-pass scaffolding for this PRD."

The "Pass 2 needs-context" path leaves the epic in a recoverable state: the user can review the `_epic.md` (which was created from Pass 1 successfully) and the partial `needs-context` story stubs, then re-run scaffold or hand-edit them. The status label is the existing `needs-context` from CONVENTIONS.md's Status Signal Labels — no new label required.

This is a documentation/instructions change to SKILL.md; no executable code is being added. The actual retry logic will be performed by the agent executing the scaffold skill (Claude itself), so the SKILL.md just needs to spell out the rules clearly enough that the executing agent follows them.

## Dependencies

- **Blocked by:** two-pass-scaffolding/001
- **Blocks:** design-spike-epic/001
