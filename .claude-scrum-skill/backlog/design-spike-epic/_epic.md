---
title: Design-Spike Epic
slug: design-spike-epic
status: open
created: 2026-05-27T07:19:32Z
---

# Design-Spike Epic

Auto-inject an "Architecture & Design" research epic at position 0 when triggered. Produces an ADR and one CONTEXT.md per implementation epic, committed to the development branch. Implementation epics' stories get `blocked_by` references to the design-spike stories so sprint planning naturally gates implementation on design completion. Every implementation story's Technical Context section receives an auto-injected reference to the CONTEXT.md + ADR.

Maps to **Phase 3 — Design-Spike Epic** in the source spec (tasks 11-14).

Depends on the Two-Pass Scaffolding epic (design-spike injection hooks into the two-pass assembly step).
