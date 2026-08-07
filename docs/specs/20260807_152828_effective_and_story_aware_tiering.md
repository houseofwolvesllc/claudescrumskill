# Effective and Story-Aware Agent Tiering — Specification

## Overview

The Opus 5 retune added a stage-to-tier resolver (`lib/workflows/_shared/resolve_agent_tier.mjs`) that assigns each agent stage a `(model, effort)` pair. A smoke test proved the runtime accepts the resolver's bare `'haiku'` model string — two of five agents ran on it — but the same test exposed that roughly a third of the tiering never fires, and that the design has a dimension missing.

**Problem 1 — the relative tiers are inert.** `resolveModel` has three targets. `SESSION` returns `{}` (inherit) and `CHEAPEST` returns `{model: 'haiku'}`; both are absolute and work. `ONE_TIER_DOWN` calls `oneTierDownFrom(sessionModel)`, and `sessionModel` is an *optional* workflow argument that appears **zero times** in `skills/project-orchestrate/SKILL.md`. No caller passes it, `MODEL_TIERS.indexOf(undefined)` returns `-1`, and the function returns `{}`.

That is silent inheritance — the exact defect the tiering epic was built to eliminate — reintroduced one level up, in the *contract* rather than at the call sites. `lib/workflows/agent_tiers.test.mjs` cannot catch it: it asserts a tier is **declared**, not that it **resolves** to a distinct model.

| Workflow | Relative stages | Status without `sessionModel` |
|---|---|---|
| `sprint_pipeline.js` | `review` | 1 of 6 stages inert |
| `adversarial_verify.js` | `skeptic`, `judge` | **fully inert** — both stages are relative |
| `elaborate_epics.js` | — | unaffected; its only stage is `SESSION` |

**Problem 2 — tiering is per-stage only.** It asks what *kind* of work a stage is (mechanical vs. reasoning) but never how *hard* the particular story is. A 1-point README edit and a 13-point core-domain story both get the session model for `implement`. The signal already exists on every story: `points`, `priority`, `persona`.

## Objectives

**Primary**

- Make the relative tiers actually resolve, by putting `sessionModel` in the invocation contract.
- Add story difficulty as a second tiering dimension, floored so a bad estimate degrades gently.
- Guard *resolution*, not just declaration, so the silent-inherit regression is catchable.

**Secondary**

- Preserve the safe-inherit fallback so existing callers keep working unchanged.

## Ubiquitous Language

| Term | Meaning |
|---|---|
| **Session model** | The tier the orchestrator itself runs at; the ceiling for every stage below it |
| **Absolute tier** | A target needing no session knowledge (`CHEAPEST`) |
| **Relative tier** | A target computed *from* the session model (`ONE_TIER_DOWN`) |
| **Clamp** | The existing rule that a stage never resolves above the session model |
| **Floor** | The lowest tier a stage may fall to regardless of difficulty |
| **Silent inheritance** | A stage running at the session tier because nobody assigned one — the original defect |

## Requirements

### Functional

**FR-1 — `sessionModel` enters the invocation contract.** Add it to the invocation block of every skill that invokes a workflow with relative tiers: `skills/project-orchestrate/SKILL.md` (sprint_pipeline) and `skills/project-emulate/SKILL.md` (adversarial_verify) at minimum, plus `skills/project-scaffold/SKILL.md` (elaborate_epics) for consistency even though its only stage inherits.

The orchestrator is a model reading markdown and knows its own identity — it already supplies `epicSlug`, `backendMode`, `baselinePath`, and `isolationStrategy` the same way. The contract line instructs it to fill in the tier it is running as, and states plainly what omission costs:

```yaml
sessionModel:  <optional 'haiku' | 'sonnet' | 'opus' — the tier you are running as.
                Stages defined relative to the session (review, skeptic, judge)
                can only be computed when this is set; omit it and they inherit
                the session tier silently.>
```

**Do not** attempt programmatic model introspection. There is no such API, and the orchestrator supplies every other argument in that block by the same mechanism.

**FR-2 — The resolver becomes story-aware.** `resolveAgentTier` gains access to the story being worked. Difficulty rules, all subject to the existing session clamp:

| Stage | 1–2 pts | 3–5 pts | 8–13 pts |
|---|---|---|---|
| `implement` | one tier down | one tier down | session |
| `review` | cheapest | one tier down | one tier down |
| `verify` | cheapest | cheapest | cheapest |
| `detect-layout`, `reset`, `pr` | cheapest | cheapest | cheapest |
| `elaborate` | session | session | session |

`verify` moves to always-cheapest: it runs a build/lint/test command and reports a status, which is not a judgment task.

**FR-3 — The implement floor is mandatory.** `implement` floors at one-tier-down and **never** reaches cheapest, at any point value. `points` is an estimate authored before anyone read the code; a mis-estimated 1-pointer that turns out to be hard must degrade gently rather than be handed to the weakest model.

`review` may floor lower, because a weak review is caught downstream by `verify` and the test suite, whereas a weak *implementation* **is** the artifact. This asymmetry is the reasoning, not an oversight.

**FR-4 — Two overrides cut against cost.** For the same reason the retune kept verification that guards destructive operations:

- `persona: ops` → never tier down, any stage. Migrations, CI, secrets, IaC — "what if this runs twice" work where blast radius beats cost.
- `priority: P0-critical` → never tier down, any stage.

**FR-5 — Guard resolution, not declaration.** Extend the test surface to cover:

- With a known `sessionModel`, every relative stage resolves to a model *distinct from* the session — the regression guard that was missing.
- The `ops` and `P0-critical` overrides suppress tiering down.
- The `implement` floor holds at every point value.
- Absent `sessionModel` remains a **safe inherit**, not a throw.

**FR-6 — Story is optional at the resolver boundary.** `adversarial_verify` has *findings*, not stories, and its call sites pass none. The resolver must fall back to pure stage tiering when no story is supplied. A two-argument shape — `resolveAgentTier(stage, context)` with `context = { sessionModel, story }` — extends without churning call sites, but the implementer may choose otherwise provided the optionality holds.

### Non-Functional

- **NFR-1 — Backward compatible.** `sessionModel` stays optional; its absence is a safe inherit. Existing callers keep working unmodified.
- **NFR-2 — No pinned model IDs.** Short tier names only (`'haiku'`, `'sonnet'`, `'opus'`), proven accepted by the smoke test.
- **NFR-3 — Inline sync preserved.** The resolver is inlined into three workflow scripts via `inline_manifest.mjs`; any signature change must be re-inlined and stay in sync.

## Decision: severity-based judge tiering is deferred

`adversarial_verify` findings carry a `severity` (`critical` | `warning` | `info`), and tiering the judge by it is the obvious parallel to tiering `implement` by points. **Deferred, deliberately.**

Two reasons. First, the judge's output *decides whether a finding survives at all* — there is no downstream check to catch a weak judgment, which makes it structurally like `implement` rather than like `review`. The most recent run is direct evidence: the judges refuted all three findings and corrected two factual errors in the orchestrator's own premises. That is not work to economize on.

Second, `severity` is self-reported by the emulator that raised the finding, with no review step between. `points` at least passes through spec authoring and scaffolding. Tiering on the weaker signal would couple judge quality to the accuracy of an unreviewed guess.

Revisit if judge cost becomes material in practice — the natural first move would be tiering the *skeptic* by severity while leaving the judge at full capability.

## Design Passes

### Subdomain classification

| Epic | Subdomain | Reasoning |
|---|---|---|
| `tier-contract-plumbing` | supporting | Wiring an existing capability into its callers; necessary, not differentiating |
| `story-aware-tiering` | core | Real domain rules with invariants — the clamp, the floor, and two overrides that must compose correctly |

### Pattern-naming pass

**No Gang of Four pattern is named, deliberately.** The override rules (`ops`, `P0-critical`) are the one plausible axis of variation — a growing policy set might eventually warrant Chain of Responsibility or a rules list. Two rules is not that axis. Per the Arbitration Rule, this stays a pure function over constant maps with two guard clauses until a third override actually arrives.

## Implementation Plan

1. **`tier-contract-plumbing`** — FR-1, and the FR-5 resolution guard for the relative stages. Touches three `SKILL.md` files and the test surface. Lands first so relative tiers work before more relativity is added.
2. **`story-aware-tiering`** — FR-2, FR-3, FR-4, FR-6, and the remaining FR-5 coverage. Touches the resolver, its three inlined copies, the `sprint_pipeline` call sites, and the test surface.

## Testing Strategy

- **Unit** — the resolver, table-driven across the stage × points grid, plus the two overrides, the implement floor at every point value, and the absent-`sessionModel` path.
- **Structural** — the existing `agent_tiers.test.mjs` declaration guard stays; the new resolution guard sits beside it. Both are needed: one catches a bare call site, the other catches a call site that declares a tier which then resolves to nothing.
- **Regression** — `inline_sync.test.mjs` must pass against the changed resolver in all three inlined copies.

## Risks

| Risk | Mitigation |
|---|---|
| Orchestrator misidentifies its own session model | The clamp already prevents resolving above session; a wrong answer degrades cost, not correctness |
| `points` estimate is wrong on a hard story | FR-3's implement floor — never below one-tier-down |
| Signature change breaks an inlined copy | `inline_sync.test.mjs` fails the build on drift |
| `verify` at cheapest misses a real failure | It reports a command's exit status; the command itself is unchanged |

## Future Considerations

- Severity-tiered skeptic (see the deferred decision above) if judge cost becomes material.
- If a third cost-cutting-against override appears, revisit the pattern decision.
- Per-run token accounting would let these rules be tuned against measured spend rather than reasoned tiers.
