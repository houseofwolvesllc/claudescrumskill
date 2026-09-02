---
title: Telemetry Reporting
slug: telemetry-reporting
status: open
created: 2026-09-02T22:23:30Z
subdomain: generic
---

# Telemetry Reporting

Add a telemetry.report key (default true) to the config.json default, preserved by the install-time merge. The reporting SKILL.md layer (sprint-status, sprint-release, project-orchestrate summary) reads the key from ../shared/config.json and, when true, renders a stage-timing section from the workflow's _telemetry: per-phase summed duration/share/count, plus critical-path wall-clock (max endedAt - min startedAt) distinguished from summed-stage cost. The _telemetry payload is returned regardless of the key.

## Shared Design Concerns

- ADR-0006: only the SKILL.md layer can read config.json; the key never reaches the workflow, and need not, since collection is unconditional.
- Consistency: read telemetry.report exactly as scaffolding/paths.* are read; render is markdown-driven arithmetic over intervals.
- Distinguish critical-path wall-clock from summed-stage cost so parallel overlap is not double-counted.
