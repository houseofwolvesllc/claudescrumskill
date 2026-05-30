---
title: Author adversarial_verify.js
epic: workflow-scripts
status: done
executor: claude
priority: P1-high
points: 3
labels: [type:story, executor:claude, P1-high, epic:workflow-scripts, ready-for-work]
persona: impl
blocked_by: [foundation/001, foundation/002]
blocks: [skill-rewrites/003]
sprint: 2
---

## Objective

Author `lib/workflows/adversarial_verify.js` per contract. Claimant/skeptic/judge per finding. Returns verified findings with verdict.isReal. FR-9.

## Acceptance Criteria

- [ ] Per finding: parallel(claimant, skeptic) then judge agent
- [ ] Schema-validated returns: EvidenceSchema for claim/skeptic, VerdictSchema for judge
- [ ] Returns array of { finding, claim, skeptic, verdict }
- [ ] Includes the required `meta` block

## Dependencies
- **Blocked by:** foundation/001, foundation/002
- **Blocks:** skill-rewrites/003
