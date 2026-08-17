---
title: Prompt Surface Detox
slug: prompt-surface-detox
status: open
created: 2026-08-07T20:10:22Z
subdomain: core
---

# Prompt Surface Detox

Remove 4.8-era scaffolding from the text every agent reads. ENGINEERING_BASELINE.md is ~1,077 words of largely Clean Code and TDD canon read by every implementation, review, and hardening agent; a stray ultrathink token forces maximum thinking on every spec run; and the remaining SKILL.md files carry step choreography of mixed value. The audit's keep-list binds here: fragile-operation sequencing stays.

Depends on: verification-deduplication

## Shared Design Concerns

- Arbitration Rule, the four Emergence priorities, and the precedence order are preserved verbatim
- Fragile-operation sequencing (branch/merge ordering, workflow invocation order, runtime preconditions) must not be removed
- Do not add prose encouraging subagent delegation
