# Hardening PRD — Run 1

## Overview

Automated hardening pass based on emulation findings from run 1. Addresses 4 warning issues discovered during cross-document consistency emulation of the new two-pass scaffolding and design-spike epic features. All findings are documentation defects in `skills/project-scaffold/SKILL.md` — no behavioral defects in the implementation.

Info-level findings (7) are logged in the emulation report but not scaffolded — they are minor enough that hand-fixing during normal future maintenance is appropriate.

## Epic: Hardening (Run 1)

### Stories

#### Fix W1: Resolve trigger precedence contradiction in Mode Detection

**Priority:** P1-high
**Executor:** claude
**Story Points:** 1
**Acceptance Criteria:**
- The "Mode Detection → Trigger Evaluation" subsection in `skills/project-scaffold/SKILL.md` lists triggers in the order matching the Input section's stated precedence (CLI flag highest, then frontmatter, then config/heuristic).
- The "first match wins" rule is preserved.
- Same edits mirrored to `.claude/skills/project-scaffold/SKILL.md`.
- Re-reading the two sections produces a consistent precedence statement.

#### Fix W2: Resolve trigger precedence contradiction in Design-Spike Epic

**Priority:** P1-high
**Executor:** claude
**Story Points:** 1
**Acceptance Criteria:**
- The "Design-Spike Epic → Trigger Evaluation" subsection lists triggers in the same canonical precedence as W1 (CLI flag → frontmatter → config → auto-trigger).
- The "first match wins" rule is preserved.
- Same edits mirrored to `.claude/skills/project-scaffold/SKILL.md`.

#### Fix W3: Replace "Persona label" terminology with backend-agnostic wording

**Priority:** P1-high
**Executor:** claude
**Story Points:** 1
**Acceptance Criteria:**
- The "Two-Pass Procedure → Pass 2 — Per-Epic Elaboration" subsection in `skills/project-scaffold/SKILL.md` replaces "Persona label" with backend-agnostic language indicating that local mode uses the `persona` frontmatter field, while remote backends use a `persona:*` label.
- The replacement points to CONVENTIONS.md (Persona Labels) and PERSONAS.md for full definitions.
- Same edits mirrored to `.claude/skills/project-scaffold/SKILL.md`.

#### Fix W4: Add executing-agent guidance to CLI Flags section

**Priority:** P1-high
**Executor:** claude
**Story Points:** 2
**Acceptance Criteria:**
- The "Input → CLI Flags" subsection in `skills/project-scaffold/SKILL.md` adds a paragraph explicitly stating that there is no formal CLI argument parser; the executing agent scans `$ARGUMENTS` for the documented flag strings and treats matches as trigger sources.
- Invalid or empty flag values are documented to fall through to the next trigger source in precedence (also fixes Info finding I7).
- Same edits mirrored to `.claude/skills/project-scaffold/SKILL.md`.
