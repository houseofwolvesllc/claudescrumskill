---
title: Sequential Execution Wrapper
slug: sequential-execution
status: closed
created: 2026-05-28T05:04:12Z
---

# Sequential Execution Wrapper

Insert the top-level `## Sequential Multi-Path Mode` section in `project-orchestrate/SKILL.md`. Covers the per-spec loop, state-file archival rules (FR-22 through FR-27), queue state file lifecycle (FR-28 through FR-32), and safety-gate pause behaviors (both default and with `--skip-on-pause`).

Maps to **Phase 4 — Sequential Execution Wrapper** in the source spec (tasks 10-12).

Depends on the Dependency Resolution epic (sequential execution operates on the topologically-sorted spec list produced there).
