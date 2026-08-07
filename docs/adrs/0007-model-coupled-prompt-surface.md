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

### 4. The engineering baseline reinforces the canon rather than assuming it

This decision was **reversed during review, and the reversal is the decision on record.**

The retune initially cut `ENGINEERING_BASELINE.md` from 1,077 to 190 words. The reasoning followed the same logic as the rest of this ADR: the file is read by every implementation, review, and hardening agent, so its length multiplies across the fan-out, and roughly 85% of it restated Clean Code and TDD canon the model already knows. On that reasoning, only what the model *cannot* infer — the Arbitration Rule, the Emergence priorities, the precedence order — earns its place.

The project owner rejected that trade. The canon stays as **reinforcement**: having Clean Code and TDD in front of an implementation agent at write time is judged worth its per-agent cost even though the model could recall it unprompted. Recall and salience are not the same thing, and the cost is a known quantity while the quality delta from removing it is not.

This is the one place where the "the model already knows it, so delete it" principle running through decisions 2 and 3 is deliberately **not** applied. The distinction: deleting *verification scaffolding* removes work the model would otherwise duplicate, and the saving is mechanical. Deleting *reference material* removes context, and the loss is not measurable in advance.

`test/engineering_baseline.test.js` now guards both halves: the project's own stance is pinned verbatim (Arbitration Rule, the four Emergence priorities in order, the precedence chain), and the load-bearing canon markers must be present. A future trim cannot quietly remove either.

## Consequences

**Positive.** Roughly 20 of ~118 agent invocations per representative run are eliminated outright and ~20 more move to the cheapest tier. Fifty-four new tests convert this run's invariants from convention into build failures.

**Negative.** The suite is now explicitly coupled to a model generation, and that coupling has to be revisited on each migration rather than ignored. The tier map is a judgment call encoded as a constant — if a stage's character changes, the map must change with it.

**Risk accepted.** Folding the security lens into the per-story review means security review now happens once, while story context is live, rather than twice. If a security-class defect ever escapes that single pass, the panel is the obvious thing to reinstate — scoped to flagged files rather than the full diff.

**Unmeasured.** The fan-out reduction is verified by static agent-count, not by measured tokens, because no per-run token accounting exists. Adding it would make the acceptance criterion direct rather than proxied.

## References

- Spec: `docs/specs/20260807_130617_opus_5_prompt_surface_retune.md`
- Audit: `docs/residual-scaffolding-audit.md`
- Baseline for comparison: git tag `opus-4-8` (fb67d42)
- Amends ADR-0003 (see its 2026-08-07 amendment): `review_panel.js` is withdrawn.

## Amendment (2026-08-07): tiering resolves, and is story-aware

Decision 3 above shipped incomplete, and a smoke test caught it. The resolver's
`ONE_TIER_DOWN` target computes from `sessionModel` — an *optional* workflow
argument that appeared in none of the invoking `SKILL.md` files. No caller passed
it, so `review`, `skeptic`, and `judge` inherited the session tier silently. That
is the same defect decision 3 was written to eliminate, displaced from the call
sites into the contract, and the guard could not see it: `agent_tiers.test.mjs`
asserts a tier is *declared*, never that it *resolves*.

`sessionModel` now appears in all three invocation blocks. The orchestrator fills
it in the way it fills in `epicSlug` and `baselinePath` — it is a model reading
markdown and knows its own identity, so no programmatic introspection is needed
or available. `test/invocation_contracts.test.js` guards resolution alongside the
existing declaration guard; both are needed, because one catches a bare call site
and the other catches a call site whose tier evaporates.

The same work added the dimension decision 3 lacked. Tiering asked what *kind* of
work a stage is but never how *hard* the story is. It now reads `points`,
`persona`, and `priority`:

- `implement` — one tier down at 1–5 points, session at 8–13, **never cheapest**
- `review` — cheapest at 1–2, one tier down above
- `verify` — always cheapest; it runs a command and reports a status
- `persona: ops` and `priority: P0-critical` — never tier down, any stage

The `implement` floor is the load-bearing constraint, and the asymmetry with
`review` is deliberate: `points` is an estimate authored before anyone read the
code, so the stage that *produces the artifact* must degrade gently, while the
stage whose misses are caught downstream by `verify` and the tests may floor
lower. A future contributor tempted to "simplify" by giving both stages the same
floor should read this paragraph first.

No Gang of Four pattern was named for the two overrides. Two rules is not an axis
of variation; per the Arbitration Rule this stays a pure function over constant
maps until a third override actually arrives.

Deferred with reasoning: tiering the `adversarial_verify` judge by finding
severity. The judge's verdict decides whether a finding survives at all, with no
downstream check — structurally like `implement`, not like `review` — and
`severity` is self-reported by the emulator with no review step, a weaker signal
than `points`. If judge cost becomes material, tier the *skeptic* first.

See `docs/specs/20260807_152828_effective_and_story_aware_tiering.md`.
