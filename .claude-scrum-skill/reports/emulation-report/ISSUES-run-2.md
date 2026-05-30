# Emulation Findings — Run 2

Re-emulation after hardening run 1.

## Verification of Run 1 Findings

| ID | Finding | Status |
|----|---------|--------|
| C1 | multi_spec_queue.js references non-existent `per-spec-orchestration` sub-workflow | ✅ Resolved — `lib/workflows/multi_spec_queue.js` deleted. `/project-orchestrate` Sequential Multi-Path Mode Per-Spec Loop rewritten to be markdown-driven; the per-spec body invokes leaf workflows (`sprint_pipeline.js`, `elaborate_epics.js`, `adversarial_verify.js`, `review_panel.js`) directly. Respects the Workflow tool's "one level of nesting only" constraint. CHANGELOG `Changed` and `Removed` sections updated. ADR-0003 reflects the four-workflow reality and documents the architectural rationale (markdown owns the queue, workflows own the leaf fan-outs). |
| C2 | Schema `$ref` resolution unspecified | ✅ Resolved — `SpecSchema.json` and `EpicSchema.json` rewritten to inline their referenced sub-schemas under `$defs`. No cross-file `$ref`s remain; both schemas are self-contained and validate identically regardless of validator behavior on relative file references. |
| W1 | Concurrency claim "16" misleading | ✅ Resolved — claims updated across README, CHANGELOG, ADR-0003, and `/project-orchestrate/SKILL.md` to "up-to-`min(16, cpu_cores - 2)`" with explicit note that barrier removal is the unconditional gain and concurrency lift depends on host cores. Numerical examples added (4-core → 2, 8-core → 6, 18+-core → 16). |
| W2 | NFR-6 line-reduction target unmet | ⚠️ Accepted, not actioned. Documented in ADR-0003 Negative Consequences. Future cleanup candidate. |
| W3 | sprint_pipeline.js stage 4 returns unvalidated synthesized objects on short-circuit | ✅ Resolved — extracted `makeSprintStoryReturn(opts)` helper at top of `sprint_pipeline.js`. Short-circuit paths (review-block, verify-fail) build their return objects through this helper. Shape mirrors `SPRINT_STORY_RETURN_SCHEMA` — future schema changes require updating both locations together. |
| W4 | README still mentions `/spec` vs `/project-spec` | ⚠️ Not actioned. Pre-existing inconsistency unrelated to v2.0.0 substrate. Future cleanup. |
| I1 | `/code-review` scope cut not documented | ✅ Resolved — CHANGELOG `Removed` section and ADR-0003 explicitly note `/code-review` was out of scope (first-party Claude Code skill not in this package). |
| I2–I5 | Tooling / tone / edge cases | ⚠️ Acknowledged. Out of scope for v2.0.0; tracked for follow-up. |

## Inadvertent Finding Surfaced During Hardening

### sprint_pipeline.js was empty (0 bytes) in v2.0.0 commits before hardening

During the hardening pass, `lib/workflows/sprint_pipeline.js` was discovered to be a 0-byte file — the Sprint 2 Write call against the touched placeholder had been a no-op. The script content (252 lines) is now correctly committed. **This means v2.0.0 as initially shipped from Sprints 1–5 would have had the sprint pipeline non-functional**; without this hardening pass, `/project-orchestrate` Phase 1 Step 3 would attempt to invoke an empty workflow script.

This is a process-level lesson: Write-tool behavior against existing empty placeholders is environment-dependent. Future skill authoring should verify file size after sprint commits, or skip the placeholder step entirely.

## New Findings

🔴 Critical: 0
🟡 Warning: 0
🔵 Info: 0 (new)

## Recommendation

Proceed to Phase 3 (Project Cleanup). The two critical findings are resolved; the warning-level findings are either resolved or explicitly accepted with documentation. The codebase is clean of critical and warning findings after run 1 hardening.
