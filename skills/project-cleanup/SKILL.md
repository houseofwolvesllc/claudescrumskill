---
name: project-cleanup
description: Systematically verify and enforce codebase hygiene — zero build errors, zero lint warnings, HATEOAS compliance, no dead or duplicated code, all tests passing with at least 50% coverage. Reads the project's CLAUDE.md for overrides and treats best practices as defaults that yield to project-specific rules.
---

# Project Cleanup

Ensure the codebase is production-clean: builds without errors or warnings, passes lint with zero issues, adheres to HATEOAS and project conventions, contains no dead or duplicated code, and has comprehensive test coverage.

---

## Before You Start

1. Read the project's `CLAUDE.md` (if it exists) for project-specific rules. **CLAUDE.md overrides are authoritative** — if a project rule conflicts with a best practice listed here, the project rule wins. Record any overrides you find so you can reference them when making decisions.
2. Read `../project-scaffold/references/CONVENTIONS.md` for project management standards (if applicable).
3. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in GitHub API commands and code — never in communication with the user.
4. Identify the project's language(s), framework(s), build system, linter, test runner, and coverage tool by reading `package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`, or equivalent config files.
5. Confirm all required tooling is installed and runnable (`npm`, `npx`, `tsc`, `eslint`, `jest`/`vitest`/`pytest`/`go test`, etc.).

---

## Input

`$ARGUMENTS` can be:

1. **Nothing** — clean up the entire project in the current working directory.
2. **A path** (e.g., `src/` or `packages/api/`) — scope cleanup to a specific directory or package.
3. **A flag** `--fix` — automatically fix all issues found. Without this flag, the skill reports issues but does not modify code.
4. **A flag** `--report-only` — produce the report without any fixes, even if `--fix` is also present.

Flags can be combined: `/project-cleanup src/ --fix`

---

## Phase 1: Build Verification

Verify the project compiles and builds with zero errors and zero warnings.

### Step 1: Identify Build Commands

Detect the build toolchain from project config files:

- **Node.js/TypeScript:** `tsc --noEmit` for type checking, `npm run build` or equivalent for full build
- **Go:** `go build ./...`
- **Rust:** `cargo build 2>&1`
- **Python:** `python -m py_compile` or `mypy` for type checking
- **Multi-package (monorepo):** Run build for each workspace/package

If the project has a `build` script in `package.json`, use it. Otherwise infer from the toolchain.

### Step 2: Run Build

Execute the build command and capture all output. Parse output into:

- **Errors** — compilation failures, type errors, missing imports
- **Warnings** — unused variables, implicit any, deprecation notices

**Target: zero errors, zero warnings.**

### Step 3: Catalog Build Issues

For each issue found, record:

| File | Line | Severity | Code | Message |
|------|------|----------|------|---------|
| `src/api/handler.ts` | 42 | error | TS2345 | Argument of type 'string' is not assignable... |

If `--fix` is active, fix each issue in order of severity (errors first, then warnings). After fixing, re-run the build to confirm the fix didn't introduce new issues.

---

## Phase 2: Lint Verification

Verify the project passes lint with zero errors and zero warnings.

### Step 1: Identify Lint Configuration

Detect the linter(s) from project config:

- **ESLint:** `.eslintrc.*`, `eslint.config.*`, `eslint` field in `package.json`
- **Prettier:** `.prettierrc.*`, `prettier` field in `package.json`
- **Biome:** `biome.json`
- **golangci-lint:** `.golangci.yml`
- **Ruff/flake8:** `pyproject.toml [tool.ruff]`, `.flake8`
- **clippy:** `cargo clippy`

### Step 2: Run Linter

Execute the linter with all warnings enabled:

```bash
# Example for ESLint
npx eslint . --max-warnings 0 --format json
```

Use `--max-warnings 0` (or equivalent) to treat warnings as failures.

### Step 3: Catalog Lint Issues

For each issue found, record:

| File | Line | Rule | Severity | Message | Fixable |
|------|------|------|----------|---------|---------|
| `src/utils.ts` | 15 | `no-unused-vars` | warning | 'helper' is defined but never used | no |

### Step 4: Apply Fixes (if `--fix` active)

1. Run the linter's auto-fix first: `npx eslint . --fix`
2. Re-run the linter to identify remaining issues that need manual fixes
3. Fix remaining issues manually, following these rules:
   - **Unused imports/variables:** Remove them
   - **Formatting issues:** Apply the project's formatter (Prettier, Biome, etc.)
   - **Rule violations:** Fix the code to comply with the rule; do NOT add `eslint-disable` comments unless `CLAUDE.md` explicitly allows it
   - **Deprecation warnings:** Update to the recommended replacement
4. Re-run the linter to confirm zero remaining issues

---

## Phase 3: HATEOAS and Project Principles Compliance

Verify the codebase adheres to HATEOAS (Hypermedia as the Engine of Application State) principles and any project-specific architectural standards.

**Important:** Only apply HATEOAS checks to projects that expose REST APIs. Skip this phase entirely for CLI tools, libraries, static sites, or other non-API projects.

### Step 1: Identify API Layer

Scan for API route definitions, controllers, and response construction:

- Express/Fastify/Koa route handlers
- NestJS/Spring/Django/Rails controllers
- Serverless function handlers (Lambda, Cloud Functions)
- GraphQL resolvers (HATEOAS doesn't apply to GraphQL — skip these)

### Step 2: HATEOAS Link Audit

For each API endpoint that returns resource representations, verify:

**Self links** — Every resource response MUST include a `self` link:
```json
{
  "id": "123",
  "name": "Example",
  "_links": {
    "self": { "href": "/resources/123" }
  }
}
```

**Relational links** — Resources with relationships SHOULD include navigational links:
- Parent resource link (e.g., `collection` → `/resources`)
- Related resource links (e.g., `author` → `/users/456`)
- Action links where applicable (e.g., `approve` → `/resources/123/approve`)

**Collection links** — Collection endpoints SHOULD include:
- `self` link with current query parameters
- Pagination links (`next`, `prev`, `first`, `last`) when paginated
- Item links or embedded items with their own `self` links

**Consistency checks:**
- All link `href` values MUST correspond to actual routes that exist in the codebase
- Link relations MUST be consistent across all endpoints (don't use `_links` in some responses and `links` in others)
- Media type SHOULD be consistent (if using HAL, use HAL everywhere; if using JSON:API, use JSON:API everywhere)

### Step 3: Project-Specific Principles

Read `CLAUDE.md` and any architecture documentation (ADRs, `docs/architecture.md`, etc.) for project-specific principles. Common things to check:

- **Layered architecture compliance** — are controllers calling repositories directly instead of going through services?
- **Dependency direction** — do inner layers depend on outer layers?
- **Naming conventions** — do file names, function names, and variable names follow the project's conventions?
- **Error handling patterns** — does the project use a specific error handling strategy consistently?
- **Response envelope** — does the project wrap responses in a specific envelope format?

### Step 4: Catalog HATEOAS/Architecture Issues

For each violation found, record:

| File | Line | Category | Issue | Recommendation |
|------|------|----------|-------|----------------|
| `src/controllers/users.ts` | 78 | HATEOAS | Response missing `_links.self` | Add self link to user response |
| `src/routes/orders.ts` | 45 | Architecture | Controller directly queries DB | Route through OrderService |

If `--fix` is active:
- Add missing `_links` to response objects
- Add missing pagination links to collection responses
- Refactor architectural violations (move logic to correct layer)
- Verify fixes don't break existing tests

---

## Phase 4: Dead and Duplicated Code Detection

Find and remove code that is unused, unreachable, or unnecessarily duplicated.

### Step 1: Dead Code Detection

**Unused exports** — Identify exports that are never imported anywhere:
```bash
# Use the project's tooling if available (e.g., ts-prune, knip, unimported)
# Otherwise, for each exported symbol, grep for its import across the codebase
```

Tools to check for (use if present in devDependencies):
- `knip` — comprehensive unused file/export/dependency detector
- `ts-prune` — TypeScript-specific unused export finder
- `unimported` — unused file detector
- `depcheck` — unused dependency detector

If no specialized tool is available, perform manual analysis:

1. **Unused files** — files that are never imported or referenced
2. **Unused exports** — exported functions, classes, types, or constants that are never imported
3. **Unused dependencies** — packages in `dependencies`/`devDependencies` that are never imported
4. **Dead branches** — code paths that can never execute (e.g., `if (false)`, unreachable code after `return`)
5. **Commented-out code** — blocks of commented code (not documentation comments)
6. **Vestigial patterns** — unused interfaces/types kept "for backwards compatibility" with no consumers, re-exports that point to nothing, empty files, placeholder implementations

**Exclusions — do NOT flag as dead code:**
- Entry points referenced in `package.json` (`main`, `bin`, `exports`)
- Files referenced in build config (`webpack.config`, `vite.config`, etc.)
- Test files and test utilities
- Type declaration files (`.d.ts`) that are part of the public API
- Anything that `CLAUDE.md` explicitly says to keep

### Step 2: Duplicated Code Detection

Identify substantially duplicated code blocks:

1. **Exact duplicates** — identical code blocks (3+ lines) appearing in multiple locations
2. **Near duplicates** — code blocks that differ only in variable names, literal values, or minor structural variations
3. **Pattern duplication** — repeated patterns that should be abstracted (e.g., the same error handling try/catch block copied across 5 handlers)

**Judgment calls (follow CLAUDE.md if it has guidance):**
- Two similar 3-line blocks are fine — don't create a premature abstraction
- The same 10+ line pattern in 4+ places should be extracted
- If extracting would require complex parameterization, the duplication may be preferable — note it but don't force an abstraction

### Step 3: Catalog Dead/Duplicated Code

| File | Line(s) | Category | Description |
|------|---------|----------|-------------|
| `src/old-handler.ts` | 1-120 | Dead file | Never imported anywhere |
| `src/utils.ts` | 45-67 | Dead export | `formatDate` exported but never imported |
| `src/controllers/` | various | Duplication | Error handling block repeated in 6 controllers |

If `--fix` is active:
- **Dead code:** Remove it. Delete unused files, remove unused exports, remove unused dependencies from `package.json`.
- **Duplicated code:** Extract shared logic into utility functions or base classes. Follow the project's existing abstraction patterns.
- After each batch of removals, re-run the build and linter to confirm nothing broke.

---

## Phase 5: Test Verification and Coverage

Verify all tests pass and coverage meets the 50% minimum threshold.

### Step 1: Identify Test Framework

Detect from project config:

- **Jest:** `jest.config.*`, `jest` field in `package.json`
- **Vitest:** `vitest.config.*`, `vite.config.*` with test config
- **Mocha/Chai:** `.mocharc.*`, `mocha` field in `package.json`
- **pytest:** `pyproject.toml [tool.pytest]`, `pytest.ini`, `conftest.py`
- **Go:** Built-in `go test`
- **Rust:** Built-in `cargo test`

### Step 2: Run Tests

Execute the full test suite:

```bash
# Example for Jest/Vitest
npx jest --ci --coverage --coverageReporters=json-summary --coverageReporters=text
```

Capture:
- Pass/fail status for every test
- Coverage summary (statements, branches, functions, lines)

### Step 3: Analyze Test Results

**Failing tests** — For each failure, record:

| Test File | Test Name | Error | Category |
|-----------|-----------|-------|----------|
| `src/__tests__/auth.test.ts` | `should reject expired token` | `TypeError: jwt.verify is not a function` | Broken import |

Categorize failures:
- **Environment issues** — missing env vars, database not available, network dependency
- **Broken imports** — module not found, wrong path
- **Logic errors** — assertion failures indicating actual bugs
- **Stale tests** — tests for code that was refactored but tests weren't updated

**Coverage analysis:**

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Statements | 62% | 50% | PASS |
| Branches | 38% | 50% | FAIL |
| Functions | 71% | 50% | PASS |
| Lines | 60% | 50% | PASS |

**Target: all four metrics at or above 50%.**

### Step 4: Identify Coverage Gaps

If any metric is below 50%, identify the files and functions most responsible for the gap:

1. List uncovered files (0% coverage) that contain substantive logic (not config, not types)
2. List partially covered files where key functions lack tests
3. Prioritize by impact — covering a 200-line untested service file moves the needle more than adding edge case tests to an already-covered utility

### Step 5: Fix Tests and Improve Coverage (if `--fix` active)

**Fix failing tests first** (in this order):
1. Broken imports — update paths, fix module resolution
2. Stale tests — update tests to match refactored code
3. Logic errors — determine if the test or the code is wrong; fix the one that's wrong
4. Environment issues — add proper mocking or skip with a clear annotation

**Then improve coverage** (if below 50%):
1. Write tests for completely uncovered files with substantive logic
2. Add tests for uncovered branches in partially covered files
3. Focus on testing public API / exported functions
4. Follow existing test patterns and conventions in the project
5. Do NOT write trivial tests just to hit the number (e.g., testing that a constant equals itself)

After writing new tests, re-run the full suite to confirm all tests pass and coverage meets the target.

---

## Phase 6: Final Validation

After all fixes (or after cataloging all issues in report-only mode), run a final validation pass.

### Step 1: Full Verification Run

Run all checks in sequence and confirm clean results:

1. **Build:** `tsc --noEmit` / `npm run build` — zero errors, zero warnings
2. **Lint:** `npx eslint . --max-warnings 0` — zero issues
3. **Tests:** `npx jest --ci --coverage` — all pass, coverage >= 50%

### Step 2: Regression Check

If `--fix` was active, verify that fixes didn't introduce new problems:

- Run a `git diff --stat` to summarize all changes
- Verify no test that previously passed is now failing
- Verify coverage didn't decrease in any file that wasn't touched
- Verify no new lint or build warnings were introduced

---

## Output

Save the cleanup report to `.claude/reports/cleanup-report/`. Create the directory if it doesn't exist.

### Report Structure

```
cleanup-report/
├── SUMMARY.md              # High-level findings, pass/fail status for each phase
├── BUILD.md                # Build errors and warnings
├── LINT.md                 # Lint violations by rule and file
├── HATEOAS.md              # HATEOAS and architecture compliance findings
├── DEAD-CODE.md            # Dead and duplicated code inventory
├── TESTS.md                # Test results and coverage analysis
└── FIXES.md                # (if --fix was used) Summary of all changes made
```

### SUMMARY.md Format

```markdown
# Project Cleanup Report

**Date:** <ISO date>
**Scope:** <full project | scoped to path>
**Mode:** <report-only | fix>
**CLAUDE.md Overrides:** <list any project rules that overrode default behavior>

## Results

| Phase | Status | Issues Found | Issues Fixed |
|-------|--------|--------------|--------------|
| Build | PASS/FAIL | <count> errors, <count> warnings | <count> (if --fix) |
| Lint | PASS/FAIL | <count> errors, <count> warnings | <count> (if --fix) |
| HATEOAS/Architecture | PASS/FAIL/SKIP | <count> violations | <count> (if --fix) |
| Dead/Duplicated Code | PASS/FAIL | <count> dead, <count> duplicated | <count> (if --fix) |
| Tests | PASS/FAIL | <count> failing, coverage: <pct>% | <count> (if --fix) |
| **Overall** | **PASS/FAIL** | **<total>** | **<total>** |

## Coverage Summary

| Metric | Before | After | Target | Status |
|--------|--------|-------|--------|--------|
| Statements | <pct>% | <pct>% | 50% | PASS/FAIL |
| Branches | <pct>% | <pct>% | 50% | PASS/FAIL |
| Functions | <pct>% | <pct>% | 50% | PASS/FAIL |
| Lines | <pct>% | <pct>% | 50% | PASS/FAIL |

## Critical Issues

<List any issues that block production readiness>

## Recommendations

<Prioritized list of remaining work if not all issues were fixed>
```

---

## Execution Notes

**CLAUDE.md is king.** If the project says "we use `eslint-disable` for generated files" or "skip HATEOAS for internal microservice endpoints" or "we intentionally keep the old API types for backwards compat" — follow those rules. Best practices are defaults, not mandates.

**Fix in dependency order.** Build errors can cause false-positive lint failures. Dead code removal can cause build errors. Fix in this order: dead code removal, build errors, lint issues, HATEOAS compliance, test fixes, coverage improvement.

**Don't over-abstract.** When removing duplicated code, only extract when it genuinely simplifies the codebase. Three similar 5-line blocks are not necessarily worth a shared utility with 3 parameters.

**Don't write bad tests.** When improving coverage, write meaningful tests that verify actual behavior. A test that just calls a function without asserting anything useful doesn't count. Focus on public API surface, error paths, and boundary conditions.

**Report, don't surprise.** In `--fix` mode, the FIXES.md file should clearly document every change made and why. The user should be able to review all changes before committing.

**Preserve project style.** When writing new tests or refactoring code, match the existing patterns in the codebase. Don't introduce a new testing pattern, assertion library, or file structure convention.
