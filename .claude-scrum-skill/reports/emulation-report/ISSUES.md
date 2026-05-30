# Emulation Findings — Run 1 (v2.0.0 Workflow-Backed Re-Plumbing)

Scope: validate the Phase 1 work against the consumer workflows: invoking `/project-orchestrate spec.md` on v2.0.0, the workflow scripts' contracts vs skill markdown invocations, schema cross-references, install.js correctness, plugin install path, README accuracy.

Project is a markdown skill suite + new JavaScript layer. Phase 2 categories partially apply now that JS is in scope.

---

## 🔴 Critical

### C1. multi_spec_queue.js references a non-existent `per-spec-orchestration` sub-workflow

**Category:** Workflow Tool Contract / Missing Artifact
**Files:** `lib/workflows/multi_spec_queue.js`, `skills/project-orchestrate/SKILL.md`

`multi_spec_queue.js` calls `await workflow('per-spec-orchestration', {...})` per spec. No `per-spec-orchestration` workflow was authored in this release; calling it would throw "unknown name" at runtime. Sequential Multi-Path Mode is non-functional as shipped.

**Deeper structural issue:** even if `per-spec-orchestration` existed, the Workflow tool's "one level of nesting" constraint would prevent that sub-workflow from invoking `sprint_pipeline.js` as a further nested workflow. The whole per-spec flow would have to be inlined as `agent()` calls inside one workflow.

**Recommendations (pick one):**

- **(a)** Implement `per_spec_orchestration.js` that handles the full single-spec orchestration as inline `agent()` calls (no further nested workflows). Big script — duplicates a lot of skill logic.
- **(b)** Re-architect: multi-spec mode handled in skill markdown (not in a workflow). The skill loops over specs and invokes the per-skill workflows (sprint_pipeline, etc.) for each one. multi_spec_queue.js is deleted; the queue state file management lives in the skill markdown.
- **(c)** Ship multi-spec mode as a known-broken feature in v2.0.0 with a CHANGELOG note, fix in a follow-up v2.1.

Recommend **(b)** — cleanest and respects the Workflow tool's nesting constraint.

---

### C2. Schema `$ref` resolution unspecified

**Category:** Schema Distribution / Runtime Behavior
**Files:** `lib/workflows/schemas/SpecSchema.json` and others using `"$ref": "EpicSchema.json"`

JSON Schema `$ref` resolution against relative file paths depends on the validator implementation. The Workflow tool's `schema` option accepts a JSON Schema object — but resolving sibling-file `$ref`s is undefined behavior in the tool description. If the validator doesn't fetch them, schema validation degrades silently or fails.

**Recommendation:** Either (a) inline the referenced schemas into each consuming schema (duplicates definitions but makes them self-contained), (b) use `$defs` within a single composite schema file (preserves DRY), or (c) document the expected $ref resolution behavior and verify it works in practice. Option (a) is safest.

---

## 🟡 Warning

### W1. Concurrency claim ("16") is misleading — actual cap is `min(16, cpu_cores - 2)`

**Category:** Documentation/Performance-Claim
**Files:** `README.md`, `CHANGELOG.md`, `skills/project-orchestrate/SKILL.md`, `skills/project-scaffold/SKILL.md`, `docs/adrs/0003-workflow-backed-re-plumbing.md`

Multiple documents claim "concurrency 16" or "concurrency lifts from 3 to 16". The Workflow tool's effective cap per its description is `min(16, cpu cores - 2)`. On a typical 4-core CI runner the effective cap is 2 — LOWER than v1.8.x's hardcoded 3. On 8-core machines it's 6; only on 18+ core machines does it actually reach 16.

**Impact:** Real performance improvement is smaller than claimed and may be negative on small machines.

**Recommendation:** Update claims to "concurrency up to 16" or "concurrency lifts from 3 to up-to-16 depending on host CPU cores; per-stage barriers also removed (separate gain independent of cores)". The barrier-removal benefit is unconditional and is the real win for small-core hosts.

---

### W2. NFR-6 line-reduction target unmet

**Category:** Spec Compliance
**Files:** `skills/project-orchestrate/SKILL.md`

Source spec NFR-6 required ≥ 30% reduction in `project-orchestrate/SKILL.md` line count (target < 770 lines from ~1100). Current size is 1140 lines — slightly larger than the v1.8.x baseline. The Task-spawning prose IS gone (~50 lines deleted) but other content (Path Resolution Algorithm, pre-spawn checks, post-workflow persistence guidance) was added net-positive.

**Impact:** The verbose-prose-reduces-autonomous-misinterpretation argument from ADR-0003 isn't backed by the actual delivered content.

**Recommendation:** Either drop NFR-6 from the spec (acknowledge the trade-off — workflow invocation needs its own explanatory prose), or do a real pass at trimming the Per-Spec State File Lifecycle and Queue State File reference sections (move to a separate doc or shrink to a one-line summary referencing the workflow source).

---

### W3. sprint_pipeline.js stage 4 returns unvalidated synthesized objects on short-circuit

**Category:** Schema Validation Gap
**Files:** `lib/workflows/sprint_pipeline.js`

When review returns `recommendation: "block"` or verify fails, the pipeline stage 4 returns a hand-built object `{ storySlug, status: "blocked", branch, commits, blockers, reason }` directly — bypassing the `SPRINT_STORY_RETURN_SCHEMA`. Only the openPR-agent path validates against the schema.

**Impact:** If the hand-built shape drifts from the schema, downstream consumers may break silently. Today the shape matches, but it's an accidental contract.

**Recommendation:** Either (a) extract a helper `makeBlockedReturn(impl, blockers, reason)` that returns a frozen object matching the schema and test against the schema once, or (b) re-emit the synthesized object through a no-op agent call with the schema for validation (overhead but uniform). (a) is cleaner.

---

### W4. README Skills Reference still mentions `/spec` but it's now `project-spec`

**Category:** Documentation Drift
**Files:** `README.md` Skills Reference table

The README's Skills Reference table lists `spec | /spec <prompt>`. The actual skill registered name (per its SKILL.md frontmatter and per Claude Code's invocation) is `spec` — so the slash command is `/spec`. But the directory is `project-spec`, and the v2.0.0 schema-validated-sibling-output story documented invocation under "project-spec" naming.

**Impact:** Mild confusion — what's the canonical invocation? Likely `/spec` based on the skill's `name:` field.

**Recommendation:** Audit and either (a) rename the skill to `project-spec` matching the directory name and other PM skills, OR (b) document the inconsistency. Out of scope for v2.0.0 hardening; flag for a future cleanup.

---

## 🔵 Info

### I1. `/code-review` references in spec aren't honored

**Category:** Scope Slippage
**Files:** Source spec (story 004 mentioned `/code-review`); CHANGELOG; ADR-0003

The spec called out `/code-review` as a skill rewrite target. `/code-review` is a Claude Code first-party skill — not part of this package — so we cannot rewrite it. The implementation correctly scoped to `/project-cleanup` only, but the CHANGELOG and ADR-0003 should explicitly note the scope cut.

---

### I2. ADR-0003 says "first time the project takes that bet"

**Category:** Documentation Tone
**Files:** `docs/adrs/0003-workflow-backed-re-plumbing.md`

The ADR's "first time the project has required a specific Claude Code feature beyond the basic tool set" framing might age poorly if future Claude Code basic tool sets gain or lose features. Leave as-is for now; an aside.

---

### I3. Workflow scripts have no test harness

**Category:** Tooling/Maintenance
**Files:** All `lib/workflows/*.js`

JavaScript joined the package in v2.0.0. There are no unit tests, no linter, no type checker. Future maintenance risk grows as workflows accumulate.

**Recommendation:** Add `vitest` + ESLint as devDependencies and stand up a minimal test for each workflow (mock the Workflow tool primitives and assert on the structure of agent prompts and the return shape). Out of scope for v2.0.0; track as v2.1 work.

---

### I4. install.js doesn't clean up old `_workflows/` if package is downgraded

**Category:** Install Hygiene
**Files:** `bin/install.js`

If a user upgrades to v2.0.0, then downgrades to v1.8.x, the `_workflows/` directory remains in `~/.claude/skills/`. v1.8.x skills don't reference it; no functional impact, just disk dust.

**Recommendation:** None critical. If we cared, install.js could note its v2 install and a downgrade script could clean. Out of scope.

---

### I5. Path Resolution Algorithm doesn't handle the loaded-from-cache case

**Category:** Edge Case
**Files:** `skills/project-orchestrate/SKILL.md`, `skills/project-scaffold/SKILL.md`, etc.

The algorithm walks up from the absolute path of the loaded SKILL.md. If Claude Code reads SKILL.md from a cache rather than from disk (e.g., embedded plugin in a snap), the "absolute path of the loaded SKILL.md" may be ambiguous.

**Recommendation:** No action — the path resolution works in all currently-supported install paths. Add a note in a future spec when this case actually arises.

---

## Coverage Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Discovery | Complete | Roles: skill consumer, workflow author, schema consumer, plugin install user. Actions: invoke skills, workflow scripts run, schemas validate. |
| Phase 2: Integration Seams | Adapted | Cat 4 (IoC/DI) partially applies (workflow nesting constraint). Cat 1-2-3-5-6 mostly N/A. |
| Phase 3: Layer Contracts | Partial | Schema $ref resolution is a layer-contract gap (C2). |
| Phase 4: Permutation Matrix | Implicit | 4 install paths (global/local/plugin/manual) × 5 workflow scripts × {present, missing Workflow tool}. |
| Phase 5: Walkthrough | Done | Per-skill consumer walkthrough. |
| Phase 6: Coverage Report | This file | |

## Findings Count

- 🔴 Critical: 2 (C1 multi_spec_queue's non-existent sub-workflow; C2 schema $ref ambiguity)
- 🟡 Warning: 4
- 🔵 Info: 5

Both critical findings reflect real ship blockers if the goal is shippable v2.0.0. C1 makes Sequential Multi-Path Mode non-functional. C2 may make schema validation silently degrade. Hardening pass must address at minimum C1 and C2.
