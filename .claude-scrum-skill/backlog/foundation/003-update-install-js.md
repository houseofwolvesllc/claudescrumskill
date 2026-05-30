---
title: Update bin/install.js to copy lib/workflows
epic: foundation
status: done
executor: claude
priority: P1-high
points: 2
labels: [type:story, executor:claude, P1-high, epic:foundation, ready-for-work]
persona: impl
blocked_by: [foundation/001]
blocks: []
sprint: 1
---

## Objective

Update `bin/install.js` to copy `lib/workflows/` to `<install-dir>/_workflows/` during postinstall. Works for both global and local install. FR-5.

## Acceptance Criteria

- [ ] install.js copies lib/workflows recursively to <skillsDir>/_workflows/
- [ ] Underscore prefix prevents Claude Code from registering directory as a skill
- [ ] Existing skill copy logic unchanged

## Dependencies
- **Blocked by:** foundation/001
- **Blocks:** none
