---
title: Update README.md with two-pass and design-spike documentation
epic: documentation-verification
status: backlog
executor: claude
priority: P2-medium
points: 5
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

Apply the full README update checklist defined in the source spec's Phase 5 Step 19 — README updates are a required deliverable since the README is the primary user-facing surface for these features.

## Acceptance Criteria

Per the source spec Implementation Plan Phase 5 step 19, all seven of the following must be addressed in `README.md`:

- [ ] **Scaffolding Modes section** — add a "Two-Pass Mode" subsection documenting trigger heuristics (word count threshold, `scaffold_mode` frontmatter, CLI flag), override semantics (`single-pass` vs `two-pass`), and what the user sees in the skill output (trigger announcement, Pass 1/Pass 2 progress, auto-downgrade behavior)
- [ ] **Scaffolding Modes section** — add a "Design-Spike Epic" subsection documenting what auto-injects, what the design-spike produces (ADR at `<paths.adr>/` + per-epic `CONTEXT.md` at `<paths.context>/<epic-slug>/`), how to suppress it via `design_spike: false`, how implementation subagents consume the artifacts, and the gating relationship
- [ ] **Write a PRD walkthrough** — add a PRD frontmatter example showing the new `scaffold_mode` and `design_spike` overrides alongside the existing PRD authoring guidance
- [ ] **Configuration table** — add rows for `scaffold.two_pass_threshold_words` (5000), `scaffold.design_spike_enabled` (true), `paths.context` (`.claude-scrum-skill/context`)
- [ ] **Autonomous Orchestration section** — update the `/project-orchestrate` flow description to note that on triggered runs the design-spike epic executes first and produces ADRs + CONTEXT.md files that seed the implementation epics; update the Phase 1 flow summary to show design-spike as the leading epic
- [ ] **Skills table** — no row changes required, but verify each skill description still accurately reflects its behavior after these changes; tighten wording if any description has become misleading
- [ ] **Best Practices / Tips section** (if present) — add a tip noting that authors of large PRDs benefit from including explicit architectural intent the design-spike epic can lift into the ADR
- [ ] No bot/AI attribution markers

## Technical Context

The README sections to touch (identified during spec authoring):
- §117 "Scaffolding Modes" — add the two new subsections here
- §142 "Write a PRD" — add frontmatter override example
- §130 area "Configuration" — add three rows to the keys table
- §270 skill table — verify accuracy
- §317 "Autonomous Orchestration" — update flow description
- "Best Practices" section if it exists

Keep wording crisp — the README is dense and adding bloat dilutes existing content. Cross-reference CONVENTIONS.md and the SKILL.md files for deep detail rather than duplicating.

## Dependencies

- **Blocked by:** foundation/004 (CONVENTIONS.md must document the conventions before README cross-references them), orchestrate-integration/001 (orchestrate behavior must be final before README describes it)
- **Blocks:** documentation-verification/003
