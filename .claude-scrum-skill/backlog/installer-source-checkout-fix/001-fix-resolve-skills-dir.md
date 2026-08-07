---
title: Resolve the install target correctly from a source checkout
epic: installer-source-checkout-fix
status: backlog
executor: claude
priority: P1-high
points: 3
labels:
  - type:story
  - executor:claude
  - P1-high
  - epic:installer-source-checkout-fix
persona: impl
---

## Objective

Resolve the install target correctly from a source checkout

## Acceptance Criteria

- [ ] Running the installer from a source checkout targets the repo root's .claude/skills
- [ ] Running from under node_modules still targets the consuming project root
- [ ] Running with npm_config_global=true still targets ~/.claude/skills
- [ ] The resolver never returns the filesystem root
- [ ] Unit tests cover all three paths plus the root-guard

## Technical Context

bin/install.js resolveSkillsDir(), lines ~45-62. The walk-up loop's terminating condition is projectRoot !== path.dirname(projectRoot), which bottoms out at '/'. A source checkout can be detected by the presence of package.json with the expected name, or bin/ and skills/ as siblings.
