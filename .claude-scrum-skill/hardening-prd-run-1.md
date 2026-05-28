# Hardening PRD — Run 1 (Multi-Spec Sequential Orchestration)

## Overview

Automated hardening pass based on emulation findings from run 1. Addresses 2 warning-level specification-clarity issues in `skills/project-orchestrate/SKILL.md`. Both fixes are small documentation edits to the Mode Classification section.

Info-level findings (5) are logged in the emulation report but not scaffolded.

## Epic: Hardening (Run 1)

### Stories

#### Fix W1: Add Mode Classification row for "2+ tokens, all non-files"

**Priority:** P1-high
**Executor:** claude
**Story Points:** 1
**Acceptance Criteria:**
- The Mode Classification table in Input Parsing and Mode Detection gains a row covering 2+ tokens where all resolve to non-files (multiple repo identifiers).
- The expected behavior is ABORT with an error explaining that multi-repo invocation is unsupported and listing the offered repo identifiers.
- Mirrored to `.claude/skills/project-orchestrate/SKILL.md`.

#### Fix W2: Add Pre-Classification Step about flag/arg disambiguation

**Priority:** P1-high
**Executor:** claude
**Story Points:** 1
**Acceptance Criteria:**
- A "Pre-Classification Step" sentence (or short paragraph) is added at the top of the Mode Classification subsection making explicit that flag tokens (starting with `--`) are separated from argument tokens BEFORE the classification table is applied.
- The Flag Parsing subsection is cross-referenced as the validator for those flag tokens.
- Mirrored to `.claude/skills/project-orchestrate/SKILL.md`.
