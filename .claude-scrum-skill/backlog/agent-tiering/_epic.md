---
title: Agent Tiering
slug: agent-tiering
status: open
created: 2026-08-07T20:10:22Z
subdomain: core
---

# Agent Tiering

Assign an explicit (model, effort) tier to every agent() call in lib/workflows/. None currently set either, so every stage inherits the session tier — including detect-layout, which runs git ls-files, and reset, which runs a fixed git sequence. Mechanical stages move to the cheapest tier; reasoning stages keep the session model. Tier resolution must degrade sanely when the session model is already inexpensive.

Depends on: verification-deduplication

## Shared Design Concerns

- Do not pin model IDs in SKILL.md prose; tiering belongs in the workflow scripts
- Tiering down from an already-inexpensive session model must be suppressed
- Effort is a cost lever, not a verbosity lever — do not lower effort to shorten output
