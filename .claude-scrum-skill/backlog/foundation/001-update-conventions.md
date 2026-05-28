---
title: Document depends_on PRD frontmatter field in CONVENTIONS.md
epic: foundation
status: backlog
executor: claude
priority: P1-high
points: 2
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:foundation
  - ready-for-work
persona: impl
blocked_by: []
blocks:
  - mode-detection/001
sprint: null
---

## Objective

Document the new `depends_on` PRD frontmatter field in `skills/shared/references/CONVENTIONS.md` (and the `.claude/` mirror) so the orchestrate skill can cross-reference the convention rather than redefining it.

## Acceptance Criteria

- [ ] A new subsection under "Frontmatter Fields (Local Mode)" documents the `depends_on` field for PRD-level frontmatter.
- [ ] The documentation specifies the value type (YAML list of paths or basenames), path resolution rules (relative to declaring spec's directory, fallback to basename match against current invocation's argument list), and the abort-on-missing-dependency rule.
- [ ] The documentation notes the field is parallel to the existing story-level `blocked_by` convention but operates at the spec level for `/project-orchestrate` multi-path invocations.
- [ ] Both `skills/shared/references/CONVENTIONS.md` and `.claude/skills/shared/references/CONVENTIONS.md` are updated identically.
- [ ] No content removed — additions only.
- [ ] No bot/AI attribution markers added.

## Technical Context

The existing CONVENTIONS.md has a "Frontmatter Fields (Local Mode)" section added in v1.7.0 documenting the `epic_type: design-spike` field. Add a parallel subsection (or extend the existing table) documenting `depends_on` at the PRD-document level.

Example frontmatter to include in the docs:

```yaml
---
title: My Spec
depends_on:
  - other-spec.md            # basename match against other args
  - subdir/another-spec.md   # path match relative to this spec's directory
---
```

Source spec sections to consult:
- FR-13 (value shape)
- FR-17 (missing-dep abort rule)
- "Dependency Path Resolution" section in the source spec

## Dependencies

- **Blocked by:** none
- **Blocks:** mode-detection/001 (the orchestrate Input Parsing section cross-references CONVENTIONS)
