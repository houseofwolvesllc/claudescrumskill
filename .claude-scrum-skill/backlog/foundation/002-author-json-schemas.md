---
title: Author all 8 JSON Schema files
epic: foundation
status: done
executor: claude
priority: P1-high
points: 3
labels: [type:story, executor:claude, P1-high, epic:foundation, ready-for-work]
persona: impl
blocked_by: [foundation/001]
blocks: [workflow-scripts/001, workflow-scripts/002, workflow-scripts/003, workflow-scripts/004, workflow-scripts/005]
sprint: 1
---

## Objective

Author 8 JSON Schemas (Draft 2020-12) at `lib/workflows/schemas/`: SpecSchema, EpicSchema, StorySchema, EmulationFindingSchema, ReviewVerdictSchema, SprintStoryReturnSchema, ScaffoldOutputSchema, PRDFrontmatterSchema.

## Acceptance Criteria

- [ ] Each schema is a valid JSON Schema Draft 2020-12 document
- [ ] Field shapes match FR-13 through FR-20 of the source spec
- [ ] Cross-schema references resolve (e.g., Epic has Story[])

## Dependencies
- **Blocked by:** foundation/001
- **Blocks:** all workflow-scripts stories
