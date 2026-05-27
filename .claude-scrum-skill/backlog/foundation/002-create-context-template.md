---
title: Create CONTEXT.md template
epic: foundation
status: backlog
executor: claude
priority: P0-critical
points: 3
labels:
  - type:story
  - executor:claude
  - P0-critical
  - epic:foundation
  - ready-for-work
persona: impl
blocked_by: []
blocks:
  - design-spike-epic/001
  - design-spike-epic/002
  - orchestrate-integration/001
sprint: null
---

## Objective

Create the shared CONTEXT.md template at `skills/shared/templates/CONTEXT-template.md` (and mirror to `.claude/skills/shared/templates/`) defining the required sections that every per-epic CONTEXT.md will follow.

## Acceptance Criteria

- [ ] File `skills/shared/templates/CONTEXT-template.md` exists
- [ ] File `.claude/skills/shared/templates/CONTEXT-template.md` exists with identical contents
- [ ] The template contains the seven required sections in this order: Overview, Naming Conventions, File Layout, Shared Types & Interfaces, Patterns to Follow, Patterns to Avoid, External References
- [ ] Each section has placeholder text describing what belongs there, with at least one concrete example demonstrating the expected level of specificity
- [ ] The H1 uses the placeholder `<Epic Name> — Shared Context`
- [ ] No bot/AI attribution markers in the file

## Technical Context

Per the source spec Technical Specifications section, the template structure is:

```markdown
# <Epic Name> — Shared Context

## Overview
<1-2 sentence summary of what this epic builds and how its stories fit together>

## Naming Conventions
<Domain terms, prefixes, suffixes specific to this epic.
Example: "All endpoint handlers prefix with `handle_`. All event names use past tense (`EntryCreated`, not `CreateEntry`)."

## File Layout
<Where new files for this epic's stories live.
Example: "Repository implementations under `src/data/<entity>/`. Controllers under `src/api/<entity>/`. Types under `src/core/<entity>/types.ts`.">

## Shared Types & Interfaces
<Code blocks with type definitions stories must consume rather than redefine.>

## Patterns to Follow
<Code-level patterns with examples. Error handling, logging, pagination, etc.>

## Patterns to Avoid
<Anti-patterns specific to this epic with rationale.>

## External References
- ADR: <path to ADR>
- CLAUDE.md sections: <bullet list>
- Upstream docs: <links if any>
```

The template is consumed by:
1. Design-spike research subagents that author concrete CONTEXT.md files per implementation epic
2. Implementation subagents that READ CONTEXT.md files during story execution

Templates directory may not exist yet — create `skills/shared/templates/` and `.claude/skills/shared/templates/` if missing.

## Dependencies

- **Blocked by:** none
- **Blocks:** design-spike-epic/001, design-spike-epic/002, orchestrate-integration/001
