---
title: Insert Dependency Resolution subsection
epic: dependency-resolution
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:dependency-resolution
  - ready-for-work
persona: impl
blocked_by:
  - mode-detection/001
blocks:
  - sequential-execution/001
sprint: null
---

## Objective

Add a "Dependency Resolution" subsection inside the new Input Parsing and Mode Detection section. Applicable only to sequential multi-path mode. Documents `depends_on` frontmatter parsing, path resolution, cycle detection, missing-dep detection, and topological sort with stable tie-break.

## Acceptance Criteria

- [ ] A "### Dependency Resolution" subsection is added inside "## Input Parsing and Mode Detection" in `skills/project-orchestrate/SKILL.md`.
- [ ] The subsection documents the `depends_on` YAML frontmatter shape per FR-13 (list of paths or basenames).
- [ ] The subsection documents the path resolution algorithm per "Dependency Path Resolution" in the source spec: try relative to declaring spec's directory first, fall back to basename match, abort if neither resolves to a spec in the current invocation's argument list.
- [ ] The subsection documents the dependency graph construction (DAG with edges from depended-upon to dependent) per FR-14.
- [ ] The subsection documents cycle detection per FR-16, including self-cycles (spec-A depends on spec-A.md). Specifies the abort error format: "Dependency cycle detected. No specs were started. Cycle members: ..." with the cycle members enumerated.
- [ ] The subsection documents missing-dependency detection per FR-17. Specifies the abort error format: "Dependency not in argument list: ..." with the missing entry named.
- [ ] The subsection documents the topological sort per FR-14 and FR-15: stable, ties broken by original argument order.
- [ ] The subsection documents the no-`depends_on` fallback per FR-18: argument order is the execution order.
- [ ] The subsection notes that all dependency validation runs BEFORE any spec executes, per NFR-3.
- [ ] Both `skills/project-orchestrate/SKILL.md` and `.claude/skills/project-orchestrate/SKILL.md` are updated identically.
- [ ] No content removed — additions only.
- [ ] No bot/AI attribution markers added.

## Technical Context

The Dependency Resolution subsection sits inside the Input Parsing section but operates only when multi-path mode was selected. It's a separate subsection so the mode-detection logic stays readable, but it's logically part of the same pre-execution validation.

Source spec sections to consult:
- FR-13 through FR-18
- "Dependency Path Resolution" subsection
- "User Experience → Cycle Detection (Aborted Run)" — for the error message format
- "User Experience → Dependency Override of Argument Order" — for the announcement format

## Dependencies

- **Blocked by:** mode-detection/001 (the Input Parsing section must exist first)
- **Blocks:** sequential-execution/001 (the sequential execution wrapper operates on the topologically sorted spec list)
