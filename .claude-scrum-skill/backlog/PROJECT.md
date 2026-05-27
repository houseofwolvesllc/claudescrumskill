---
name: Orchestrate Large-PRD Hardening
created: 2026-05-27T07:19:32Z
sprints: []
---

# Orchestrate Large-PRD Hardening

Two strategic improvements to `/project-orchestrate` for handling large PRDs:

1. **Two-pass scaffolding** — splits PRD parsing work across multiple focused subagents so per-epic context stays tight, regardless of PRD size.
2. **Design-spike epic** — auto-injects a research-driven pre-epic that produces an ADR and per-epic `CONTEXT.md` files, giving every implementation subagent a shared anchor for naming, file layout, types, and patterns.

Both improvements are additive, backward-compatible, and configurable. Small PRDs (single epic, <5000 words) follow the existing single-pass path unchanged.

Source spec: `docs/specs/20260527_000454_orchestrate_large_prd_hardening.md`
