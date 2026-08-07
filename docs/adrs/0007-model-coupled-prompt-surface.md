# ADR-0007: The Prompt Surface Is Model-Coupled, and Verification Is Deleted Not Rewritten

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Keith Garcia (project owner)

## Context

This suite's prompt surface — eight `SKILL.md` files, four shared references, and the agent prompts embedded in `lib/workflows/` — was authored across the Claude Opus 4.6–4.8 era. Moving the session model to Opus 5 produced roughly a 4x increase in wall-clock time and token usage with no code change on either side. Per-token pricing is identical between the two models, so the entire increase was token *volume*.

Three documented behavior changes explain it, and each inverts an assumption the suite was built on:

| | Opus 4.8 | Opus 5 |
|---|---|---|
| Thinking when `thinking` is omitted | off | adaptive, on |
| Self-verification | under-verified; needed prompting | verifies unprompted |
| Subagent delegation | under-reached; needed encouragement | reaches readily |

A fourth factor amplified all three: no `agent()` call in `lib/workflows/` set `model` or `effort`, so roughly 100 agent invocations per orchestrate run inherited the session tier — including stages whose entire job is running `git ls-files`, resetting a worktree, or opening a PR.

The suite had, in other words, accumulated a set of workarounds for a model that no longer behaves that way. The workarounds did not become neutral; they became actively expensive.

## Decision

### 1. The prompt surface is a per-model artifact, and retuning is recurring

Prompts are not model-agnostic assets. Text written to overcome one generation's reluctance becomes overtrigger on the next. This is now treated as a standing obligation: each model migration triggers a prompt audit, not just a compatibility check.

The corollary is that `SKILL.md` prose must **not** pin model identifiers. Model-specific behavior belongs in `lib/workflows/`, where it is one constant map away from being changed. Pinning a model name in prose would spread the coupling across the entire surface.

### 2. Verification scaffolding is deleted, not rewritten

This is the decision most likely to surprise a future contributor, because it inverts ordinary prompting advice. "Ask the model to double-check its work" is generally sound. On a model that already self-verifies, it is not: the instruction buys a second pass at full price and produces no additional coverage.

So the remedy applied throughout was **deletion**:

- `review_panel.js` (4 lenses over the same diff the per-story review already covered) — deleted, security lens folded into the surviving review.
- The claimant in `adversarial_verify.js` — deleted; the finding *is* the affirmative claim.
- The self-check sentence in `buildReviewPrompt` — deleted.
- Per-phase "re-run and confirm" sentences in `/project-cleanup` and `/project-orchestrate` — deleted.

`test/prompt_surface.test.js` now fails the build on `double-check` / `re-verify` / `confirm-your-work` phrasing anywhere on the surface. The prohibition is enforced rather than remembered.

**What was deliberately kept:** verification that guards a *destructive or order-dependent* operation. Phase 4's re-run guard on code deletion stays. The distinction is that those sequences protect against an irreversible action, not against the model being careless.

### 3. Agent stages declare their tier explicitly, including inheritance

Each `agent()` call spreads `resolveAgentTier(stage, sessionModel)`. Mechanical stages resolve to the cheapest model at low effort; reasoning stages keep the session model.

The non-obvious part: the `implement` stage, which intentionally runs at the session's own model and effort, still declares that explicitly rather than leaving the call bare. This is what makes "deliberately inherits" and "nobody assigned a tier" distinguishable in source — and therefore what makes `lib/workflows/agent_tiers.test.mjs` possible at all. The original defect was *silent* inheritance; a guard that cannot tell intent from omission would not have caught it.

Tier resolution never degrades below the session model. Tiering "one down" from an already-inexpensive session is meaningless, and the resolver suppresses it.

### 4. The engineering baseline states project stance only

`ENGINEERING_BASELINE.md` went from 1,077 to 190 words. It is read by every implementation, review, and hardening agent, so its cost multiplies across the whole fan-out — and roughly 85% of it restated Clean Code and TDD canon the model already knows.

What survives is what the model *cannot* infer: the Arbitration Rule, the four Emergence priorities, and the precedence order. The header asserts that Clean Code and test-driven development are binding without restating them. `test/engineering_baseline.test.js` guards both directions — the stance must stay, the canon must not creep back.

## Consequences

**Positive.** Roughly 20 of ~118 agent invocations per representative run are eliminated outright and ~20 more move to the cheapest tier; ~1,150 tokens leave every agent that reads the baseline. Fifty-four new tests convert this run's invariants from convention into build failures.

**Negative.** The suite is now explicitly coupled to a model generation, and that coupling has to be revisited on each migration rather than ignored. The tier map is a judgment call encoded as a constant — if a stage's character changes, the map must change with it.

**Risk accepted.** Folding the security lens into the per-story review means security review now happens once, while story context is live, rather than twice. If a security-class defect ever escapes that single pass, the panel is the obvious thing to reinstate — scoped to flagged files rather than the full diff.

**Unmeasured.** The fan-out reduction is verified by static agent-count, not by measured tokens, because no per-run token accounting exists. Adding it would make the acceptance criterion direct rather than proxied.

## References

- Spec: `docs/specs/20260807_130617_opus_5_prompt_surface_retune.md`
- Audit: `docs/residual-scaffolding-audit.md`
- Baseline for comparison: git tag `opus-4-8` (fb67d42)
- Amends ADR-0003 (see its 2026-08-07 amendment): `review_panel.js` is withdrawn.
