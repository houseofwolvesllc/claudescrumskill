---
title: Two-Pass Scaffolding
slug: two-pass-scaffolding
status: open
created: 2026-05-27T07:19:32Z
---

# Two-Pass Scaffolding

Add two-pass scaffolding mode to `/project-scaffold`. Pass 1 extracts the epic skeleton, Pass 2 spawns per-epic elaboration subagents (max 3 concurrent). Trigger heuristic: word count > 5000 OR `scaffold_mode: two-pass` frontmatter OR CLI flag. Auto-downgrades to single-pass when Pass 1 finds ≤ 2 epics. All four backends (local, GitHub, Jira, Trello) reuse the two-pass output via the existing per-backend creation logic.

Maps to **Phase 2 — Two-Pass Scaffolding** in the source spec (tasks 5-10).

Depends on the Foundation epic (config keys and templates must exist first).
