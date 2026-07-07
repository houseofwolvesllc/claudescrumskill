# Integration Seams — Validation

All seams below were exercised by reading source at file:line and by running
`npm test` (`node --test`) — **65 tests, 65 pass, 0 fail**.

## 1. Config coverage (installer ↔ skills)

- `bin/install.js:64-87` installs `skills/shared/config.json`: copies everything
  else via `copyRecursive` skipping the config, then `installConfig` writes the
  default on a fresh dest or **deep-merges** user values on upgrade
  (`deepMerge`, `bin/install.js:230-245`; three-branch installer at `:255-274`).
- Default config paths (`skills/shared/config.json`): `paths.specs/adr/backlog/
  context` = `.claude-scrum-skill/{specs,adr,backlog,context}`.
- Skills read exactly those keys with matching defaults:
  `project-scaffold/SKILL.md:13,16,90,268,540,646`,
  `project-orchestrate/SKILL.md:17,863-864`. **Aligned** — no path drift.
- deepMerge + installConfig are unit-covered (idempotent, orphan-key preserving,
  malformed-JSON backup+recover, array-as-leaf) — all green.

**Verdict: PASS.**

## 2. Install payload (`installWorkflows` + smoke check)

- `installWorkflows` (`bin/install.js:121-129`) copies `lib/workflows/` →
  `<skills-root>/_workflows/` via `copyRecursive(..., isTestFile)`, so
  `_shared/*.mjs` + `schemas/*.json` ship but every `*.test.*` is skipped
  (`isTestFile`, `:132-134`).
- `verifyWorkflowInstall` (`:181-208`) asserts (a) no `*.test.*` shipped and
  (b) `_shared/*.mjs` present **and importable** (`await import` each). All
  shared `.mjs` are side-effect-free (verified), so importing is safe.
- Unit tests confirm: skip predicate prunes tests but copies the rest;
  `installWorkflows` ships `_shared/*.mjs` and no `*.test.*`; smoke check passes
  on a real install and throws when a test file is planted. **All green.**

**Verdict: PASS.**

## 3. Workflow-script runtime validity + inline drift guard

- Each of the 4 scripts has exactly one top-level `export const meta`
  (verified). Top-level `return`/`await` present, consistent with the
  wrapped-eval runtime (ADR-0006). No `import`/`require`/`await import`
  anywhere — matches "no runtime module loading."
- Shared logic is inlined in delimited `BEGIN/END inlined from _shared/<m>`
  blocks. `inline_manifest.mjs` lists which script inlines which module;
  `inline_sync.test.mjs` asserts each inlined block equals its canonical module
  (exports stripped). **All 8 inline-sync assertions pass.**
- **Name-collision hazard checked (task item):** the one real risk is
  `topological_order.mjs`'s private `inBatchBlockersOf` vs `sprint_pipeline.js`'s
  own top-level `inBatchBlockers` (`sprint_pipeline.js:533`). They are
  **deliberately distinct names** (the module comment calls this out), so once
  inlined both coexist without shadowing. Full top-level name audit of
  `sprint_pipeline.js` (script fns + 5 inlined blocks) found **no collision**:
  `normalizeArgs/parseIfString/assertPlainObject`, `classifyIsolationStrategy/
  detectIsolationStrategy/WORKTREE/SERIAL_IN_TREE`, `inBatchBlockersOf/
  topologicalOrder`, `resetWorktreeCommands/resetWorktree`, `runSequential` are
  all unique against the script's own identifiers.

**Verdict: PASS** (one Info note, see ISSUES).

## 4. Schema alignment

- `SprintStoryReturnSchema.json` matches the inline `SPRINT_STORY_RETURN_SCHEMA`
  (`sprint_pipeline.js:99-111`): required `[storySlug, status]`, same enum
  `[done, blocked, failed]`, same optional `branch/prUrl/commits/blockers/
  reason`. `makeSprintStoryReturn` (`:119-127`) emits exactly this shape.
- New internal schemas `NODE_MODULES_PROBE_SCHEMA` (`:354-361`) and
  `RESET_RETURN_SCHEMA` (`:363-370`) are workflow-internal (probe/reset agent
  contracts) — correctly NOT added to `schemas/` (they are not cross-skill
  return types).
- `elaborate_epics.js` EPIC_SCHEMA and the other schemas are unchanged by this
  spec and consistent with what the scripts produce.

**Verdict: PASS.**

## 5. SKILL.md ↔ workflow arg contract

- `project-orchestrate/SKILL.md:405-416` invocation block lists 11 args +
  `isolationStrategy`. `sprint_pipeline.js:331-345` destructures exactly:
  `stories, epicSlug, releaseBranch, contextMdPath, claudeMdPath, backendMode,
  repoIdentifier, personaPreambles, baselinePath, situationalGuidance,
  isolationStrategy='auto'`. **1:1 match**, including the new optional
  `isolationStrategy` (default `'auto'`).
- F9c reconciliation done: `SKILL.md:429-461` now documents **two** execution
  models (worktree vs serial-in-tree), corrects the `min(16, cpu_cores-2)` claim
  to worktree-only, and removes the "serialized behind a lock" claim for
  serial-in-tree. The reset command sequence in the SKILL matches
  `resetWorktreeCommands` order.

**Verdict: PASS.**

## 6. Lifecycle walk (install → invoke → run)

install (config merge + workflow copy + smoke check) → orchestrate reads config
paths + resolves `<skills-root>/_workflows/sprint_pipeline.js`
(`SKILL.md:391`) → invokes with the 12-field args block → `sprint_pipeline.js`
normalizes args, guards empty batch, probes `node_modules` tracking via an
`agent`, classifies strategy (`classifyIsolationStrategy`), and runs either the
worktree-parallel or serial-in-tree (topological + `runSequential` + between-story
reset) model. Every seam in that chain is internally consistent.

**No broken or missing seam found.**
</content>
