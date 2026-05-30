---
title: Update project-spec to produce SpecSchema-validated output
epic: skill-rewrites
status: done
executor: claude
priority: P1-high
points: 2
labels: [type:story, executor:claude, P1-high, epic:skill-rewrites, ready-for-work]
persona: impl
blocked_by: [foundation/002]
blocks: [release/001]
sprint: 3
---

## Objective

Update `/project-spec/SKILL.md` to produce a SpecSchema-validated structured output alongside the markdown spec. Sibling JSON file at `<specs-path>/<timestamp>_<name>.spec.json`. FR-26.

## Acceptance Criteria

- [ ] Skill writes both .md and .spec.json files
- [ ] .spec.json conforms to SpecSchema
- [ ] Existing markdown spec output preserved unchanged
- [ ] Downstream skills can consume the JSON directly

## Dependencies
- **Blocked by:** foundation/002
- **Blocks:** release/001
