---
title: Update project-emulate with verification step
epic: skill-rewrites
status: done
executor: claude
priority: P1-high
points: 2
labels: [type:story, executor:claude, P1-high, epic:skill-rewrites, ready-for-work]
persona: impl
blocked_by: [workflow-scripts/004]
blocks: [release/001]
sprint: 3
---

## Objective

Add a "Verification" step to `/project-emulate/SKILL.md` after the existing findings phase, instructing invocation of adversarial_verify.js. Findings get verdict.isReal tags. FR-24.

## Acceptance Criteria

- [ ] New "Verification" section/step inserted post-findings
- [ ] Invokes adversarial_verify.js via Workflow tool
- [ ] Findings tagged real / false-positive / needs-more-evidence after verification
- [ ] ISSUES.md output reflects verdicts

## Dependencies
- **Blocked by:** workflow-scripts/004
- **Blocks:** release/001
