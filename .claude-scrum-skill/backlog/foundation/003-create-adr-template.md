---
title: Create ADR template (if missing)
epic: foundation
status: done
executor: claude
priority: P1-high
points: 2
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:foundation
persona: impl
blocked_by: []
blocks:
  - design-spike-epic/001
  - orchestrate-integration/001
sprint: 1
---

## Objective

Create the shared ADR template at `skills/shared/templates/ADR-template.md` (and mirror to `.claude/skills/shared/templates/`) for use by design-spike research subagents and `/project-orchestrate` Step 16, so the design-spike ADR and retrospective ADRs share a single template.

## Acceptance Criteria

- [ ] First, check whether `skills/shared/templates/ADR-template.md` already exists; if yes, this story is a no-op — close as no-change-needed
- [ ] If absent, file `skills/shared/templates/ADR-template.md` exists with the structure below
- [ ] File `.claude/skills/shared/templates/ADR-template.md` exists with identical contents
- [ ] Numbering convention is `NNNN` (4-digit zero-padded), matching common ADR practice
- [ ] No bot/AI attribution markers in the file

## Technical Context

The standard ADR template (Michael Nygard format) is the well-established baseline. Use this structure unless an existing template in the repo specifies otherwise:

```markdown
# ADR-NNNN: <Short Title of the Decision>

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** <names or roles>

## Context

<What is the issue motivating this decision? What forces are at play?>

## Decision

<What did we decide to do, in active voice and present tense.>

## Consequences

### Positive
- <Good thing that follows from this decision>

### Negative
- <Trade-off or cost being accepted>

### Neutral
- <Side-effect that is neither clearly good nor bad>

## Alternatives Considered

### <Alternative 1>
<What it was and why it was rejected>

### <Alternative 2>
<What it was and why it was rejected>

## References

- <Links to related ADRs, specs, issues, docs>
```

Output path conventions live in `shared/config.json` under `paths.adr` — the template itself doesn't need to encode the path.

## Dependencies

- **Blocked by:** none
- **Blocks:** design-spike-epic/001, orchestrate-integration/001
