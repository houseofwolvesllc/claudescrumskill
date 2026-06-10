# Project Cleanup Report

**Date:** 2026-05-30
**Scope:** full project (claude-scrum-skill v2.0.0)
**Mode:** fix
**CLAUDE.md Overrides:** The project's `.claude/CLAUDE.md` defines architectural standards (TypeScript strict, snake_case file naming, dependency inversion, etc.) that target **projects consuming the skill suite**, not the skill suite itself. The suite is markdown + JSON Schemas + a new JavaScript workflow layer + a small Node.js install script. CLAUDE.md principles do not apply to its own source layout.

## Results

| Phase | Status | Issues Found | Issues Fixed |
|-------|--------|--------------|--------------|
| Build | SKIP | N/A — no build system | N/A |
| Lint | SKIP | N/A — no lint config | N/A |
| Project Principles | SKIP | N/A — CLAUDE.md principles target consumer projects | N/A |
| Dead/Duplicated Code | PASS | 0 dead, 0 duplicated | 0 |
| Tests | SKIP | N/A — no test framework | N/A |
| **Overall** | **PASS** | **0** | **0** |

## Discovery

Project shape after v2.0.0 hardening:

- 8 skill directories under `skills/`, each containing a `SKILL.md` (markdown).
- `skills/shared/` with `config.json`, references, templates.
- **`lib/workflows/`** (new in v2.0.0) — 4 workflow scripts (JavaScript ES2024) + 8 JSON Schemas under `schemas/`.
- `bin/install.js` — Node.js postinstall, updated in v2.0.0 to copy `lib/workflows/` to `<install-dir>/_workflows/`.
- `.claude-plugin/` — Claude Code plugin manifest.
- `package.json` — npm metadata, version `2.0.0`, `files` field includes `lib/`.
- `docs/` and root markdown.
- `.github/workflows/publish.yml` — npm publish workflow.
- `docs/adrs/0001-...md`, `0002-...md`, `0003-...md` — three accepted ADRs.
- `docs/specs/_fixtures/` — verification fixtures (small_prd, large_prd, workflow_invocation_check).

This orchestration added: ~600 lines of new JavaScript (4 workflow scripts), ~250 lines of JSON Schemas (8 files inlined for $ref-resolution clarity), new SKILL.md sections (Phase 5.5 in emulate and cleanup; Workflow-tool-availability check in orchestrate; Path Resolution Algorithm documentation in orchestrate + scaffold), CHANGELOG [2.0.0], ADR-0003.

## Phase Details

### Phase 1: Build Verification — SKIP

No build system. Even with JavaScript now in scope, the workflow scripts are interpreted at runtime by the Workflow tool — not transpiled or bundled.

### Phase 2: Lint Verification — SKIP

No lint config. JavaScript files are checked-in as-shipped. Future enhancement candidate: add ESLint with a minimal config tuned for the Workflow tool's `agent()`/`parallel()`/`pipeline()` primitives (treat them as ambient globals).

### Phase 3: Project Principles Compliance — SKIP

CLAUDE.md targets consumer projects, not the suite's own markdown+JS source.

### Phase 4: Dead and Duplicated Code Detection — PASS

Cross-reference checks:

- `bin/install.js` skill list matches `skills/` directory contents. ✅
- `bin/install.js` `WORKFLOWS_SOURCE_DIR` resolves to `lib/workflows/` (exists). ✅
- `package.json` `files`: `.claude-plugin/`, `skills/`, `bin/`, `lib/` — all present. ✅
- Each skill markdown that references a workflow (`/project-orchestrate` → `sprint_pipeline.js`; `/project-scaffold` → `elaborate_epics.js`; `/project-emulate` → `adversarial_verify.js`; `/project-cleanup` → `review_panel.js`) refers to a workflow that exists at `lib/workflows/`. ✅
- No skill references the dropped `multi_spec_queue.js` (deleted in hardening run 1). ✅
- Each schema in `lib/workflows/schemas/` is self-contained (no cross-file `$ref` — hardening pass inlined refs into `$defs`). ✅
- ADR-0003 references resolve to existing files (workflow scripts, schemas, spec, source spec). ✅

**Duplicated content:**

- `.claude/skills/` mirrors `skills/` for the developer's local Claude Code. Documented install pattern, not duplication. ✅
- `EpicSchema.json` and `SpecSchema.json` both define the Epic shape inline under `$defs`. This IS duplication but intentional — each schema is self-contained for $ref-resolution safety. The cost is small (8 properties) and the safety win is meaningful. Documented in run-2 emulation report. ✅

No dead code. No problematic duplication. Phase PASS.

### Phase 5: Test Verification and Coverage — SKIP

No automated test framework. JavaScript joined the package in v2.0.0; future hardening candidate is to add `vitest` + minimal unit tests for each workflow script (mock the Workflow tool primitives, assert on the structure of constructed prompts and the workflow's return shape). Tracked in emulation report as I3.

## Critical Issues

None.

## Recommendations

The codebase is clean. No cleanup fixes were needed in this run. Forward-looking work items (tracked in emulation report; out of scope for v2.0.0):

1. Add `vitest` + ESLint as devDependencies. Stand up unit tests for each workflow script.
2. Add `markdownlint-cli2` for SKILL.md / README / CHANGELOG validation.
3. Address NFR-6 (`/project-orchestrate/SKILL.md` line reduction) via a focused trimming pass on reference material that's now better expressed in workflow code.
4. Audit the `/spec` vs `/project-spec` naming inconsistency.
