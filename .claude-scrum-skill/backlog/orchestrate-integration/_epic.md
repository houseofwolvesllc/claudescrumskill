---
title: Orchestrate Integration
slug: orchestrate-integration
status: open
created: 2026-05-27T07:19:32Z
---

# Orchestrate Integration

Update `/project-orchestrate` to integrate with the new scaffolding features:

- Step 3 subagent prompt template instructs subagents to read the epic's `CONTEXT.md` (when present) in addition to `CLAUDE.md`.
- Step 16 ADR creation reads the existing ADR sequence so design-spike ADRs and retrospective ADRs share one pool.
- Step 2 sprint planning honors the `blocked_by` gate so implementation epics wait for the design-spike epic to complete.

Maps to **Phase 4 — Orchestrate Integration** in the source spec (tasks 15-17).

Depends on the Design-Spike Epic epic (subagent prompt and ADR numbering reference artifacts produced by design-spike).
