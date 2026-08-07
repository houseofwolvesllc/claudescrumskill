---
title: Tier Contract Plumbing
slug: tier-contract-plumbing
status: open
created: 2026-08-07T22:30:26Z
subdomain: supporting
---

# Tier Contract Plumbing

sessionModel is an optional workflow argument that no caller passes, because it appears in none of the invoking SKILL.md files. Every stage defined relative to the session therefore inherits it silently. Put sessionModel in the invocation contract of each skill that invokes a workflow with relative tiers, and add the guard that makes the omission catchable rather than invisible.

## Shared Design Concerns

- sessionModel must remain OPTIONAL — its absence is a safe inherit, never a throw, so existing callers keep working
- Do not attempt programmatic model introspection; the orchestrator supplies every other argument in that block the same way
- Do not pin full model IDs — short tier names only
