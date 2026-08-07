# Opus 5 Prompt Surface & Agent Fan-Out Retune — Specification

## Overview

The skill suite's prompt surface was authored across the Claude Opus 4.6–4.8 era. Moving the session model to Opus 5 produced a reported ~4x increase in wall-clock time and token usage with no code change. Per-token pricing is identical between the two models ($5/$25 per MTok), so the entire increase is token *volume*, not rate.

Three documented Opus 5 behavior changes interact badly with this suite's design, and one long-standing gap amplifies all of them:

| Change | Opus 4.8 | Opus 5 | Effect here |
|---|---|---|---|
| Thinking default | Off when `thinking` omitted | Adaptive, on | Every agent thinks; thinking tokens are output tokens |
| Self-verification | Under-verified; needed prompting | Verifies unprompted | Explicit verification scaffolding now double-works |
| Subagent delegation | Under-reached; needed encouragement | Reaches readily | Prior encouragement pushes an open door |
| Stage tiering | — | — | **No `agent()` call in `lib/workflows/` sets `model` or `effort`** |

That last row is the amplifier: roughly 100 agent invocations per orchestrate run all inherit the session tier, including stages whose entire job is running `git ls-files` or opening a PR.

This spec removes redundant work rather than capping capability. The guidance for the self-verification change is explicit that removal is a *deletion*, not a rewrite, and carries no capability regression.

## Objectives

**Primary**

- Eliminate duplicated verification work that Opus 5 now performs internally.
- Assign an explicit `(model, effort)` tier to every agent stage so mechanical work stops running at the session tier.
- Reduce the read-cost of shared prompt context injected into every agent.

**Secondary**

- Repair `bin/install.js` so it can run from a source checkout.
- Remove residual 4.8-era scaffolding from the remaining skill files without disturbing fragile sequencing.

## Ubiquitous Language

| Term | Meaning |
|---|---|
| **Agent stage** | One `agent()` call site in a workflow script — `implement`, `review`, `verify`, `reset`, `pr`, `detect-layout`, `skeptic`, `judge`, `lens`, `elaborate` |
| **Tier** | The `(model, effort)` pair assigned to a stage |
| **Session tier** | What the harness runs at; inherited when a stage sets neither |
| **Fan-out** | Total agent invocations across one orchestrate run |
| **Verification scaffolding** | Prompt text instructing the model to check or re-check its own work |
| **Prompt surface** | All text reaching a model: `SKILL.md`, shared references, embedded agent prompts |

## Requirements

### Functional

**FR-1 — Deduplicate the review pass.** Changed code is currently reviewed twice: a per-story `review` agent (`lib/workflows/sprint_pipeline.js:621`) and a 4-lens `review_panel.js` over the same diff during `/project-cleanup` Phase 5.5. Retain the per-story review — it runs while story context is live. Remove `review_panel.js` from the cleanup flow, or scope it strictly to files the per-story pass flagged.

**FR-2 — Reduce adversarial verification from three agents to two.** `adversarial_verify.js` runs claimant + skeptic in parallel, then a judge, per finding. The finding *is* the claim; the claimant restates it. Drop the claimant, keep skeptic and judge, and pass the finding directly to the judge as the affirmative position.

**FR-3 — Remove the redundant self-check sentence** in `buildReviewPrompt` (`sprint_pipeline.js:480`): *"Confirm the baseline was honored: tests accompany the code and the design is the simplest that satisfies the story (no unearned abstraction)."* The same prompt already requests convention-compliance review.

**FR-4 — Tier every agent stage.** No `agent()` call currently sets `model` or `effort`. Required assignment:

| Stage | Site | Tier | Rationale |
|---|---|---|---|
| `detect-layout` | `sprint_pipeline.js:388` | haiku / low | Runs `git ls-files node_modules`, returns stdout |
| `reset` | `sprint_pipeline.js:684` | haiku / low | Runs a fixed git reset sequence |
| `pr` | `sprint_pipeline.js:639` | haiku / low | Opens a PR from supplied values |
| `implement` | `sprint_pipeline.js:613` | session model / session effort | Primary reasoning work |
| `verify` | `sprint_pipeline.js:629` | session model / low | Runs build/lint/test, reports status |
| `review` | `sprint_pipeline.js:621` | one tier down / medium | Judgment, but bounded by a schema |
| `skeptic`, `judge` | `adversarial_verify.js` | one tier down / medium | Bounded argument over one finding |
| `lens` | `review_panel.js` | one tier down / medium | Only if FR-1 retains a scoped panel |
| `elaborate` | `elaborate_epics.js` | session model / medium | Generative, schema-validated |

Tier resolution must degrade sanely when the session model is already inexpensive — tiering *down* from Haiku is meaningless and must not happen.

**FR-5 — Reduce `ENGINEERING_BASELINE.md` from ~1,077 words to ~150.** Lines 30–141 restate Clean Code and TDD canon the model already knows, and the file is read by every implementation, review, and hardening agent. Preserve **verbatim**: the Arbitration Rule (lines 16–26), the four Emergence priorities, and the precedence order (project `CLAUDE.md` > baseline > situational guidance). These are project stance, not restatement.

**FR-6 — Remove the stray `ultrathink` token** at `skills/project-spec/SKILL.md:8`. It sits mid-sentence at the end of the overview line and forces maximum thinking on every spec run.

**FR-7 — Repair `resolveSkillsDir()`** in `bin/install.js`. The walk-up loop searches for a `node_modules` ancestor; from a source checkout none exists, the loop terminates at the filesystem root, and the installer targets `/.claude/skills`. Detect the source-checkout case and resolve to the repo root.

**FR-8 — Audit residual scaffolding** in the remaining `SKILL.md` files. `project-cleanup` carries 27 headed steps and `project-orchestrate` 25. Some is genuine fragile-operation sequencing — branch and merge ordering, workflow invocation order, the v2.0.0 runtime precondition — and must be preserved. This requires per-step judgment; a blanket trim is out of scope.

### Non-Functional

- **NFR-1 — No capability regression.** Story completion rate and review finding quality must not degrade.
- **NFR-2 — Deterministic verifiability.** Fan-out reduction must be countable by static inspection of the workflow scripts, not inferred from a single run.
- **NFR-3 — Source-only edits.** `skills/` and `lib/` are the source of truth. `.claude/skills/` is a derived install and must not be hand-edited; it is resynced after merge.
- **NFR-4 — No model IDs in prose.** Tier assignment belongs in the workflow scripts. `SKILL.md` files must not pin model identifiers.

## Explicit Non-Goals

These are counterproductive on Opus 5 and must not appear in any change:

- Adding verification steps, or "double-check" / "re-verify" / "confirm your work" phrasing.
- Adding prose encouraging subagent delegation.
- Lowering `effort` as a means of shortening visible output — effort does not reliably control response length; prompting does.

## Expected Fan-Out Reduction

For a representative run — 10 stories, 20 emulation findings, 4 epics, serial-in-tree:

| Stage group | Before | After | Note |
|---|---:|---:|---|
| `detect-layout` | 1 | 1 | Retiered to haiku/low |
| Per-story chain | 40 | 40 | `pr` retiered to haiku/low |
| Between-story `reset` | 9 | 9 | Retiered to haiku/low |
| `adversarial_verify` | 60 | 40 | FR-2 |
| `review_panel` | 4 | 0 | FR-1 |
| `elaborate_epics` | 4 | 4 | — |
| **Total invocations** | **118** | **94** | −20% |
| **At session tier** | **118** | **74** | −37% |

Invocation count understates the saving: 20 of the surviving stages move to the cheapest tier, and FR-5 removes ~1,250 tokens from every agent that reads the baseline.

## Architecture

Four independent change surfaces:

1. **Agent graph** (`lib/workflows/*.js`) — which stages exist and what tier each runs at. FR-1 through FR-4.
2. **Shared context** (`skills/shared/references/`) — text every agent reads. FR-5.
3. **Skill prose** (`skills/*/SKILL.md`) — per-skill instructions. FR-6, FR-8.
4. **Installer** (`bin/install.js`) — deployment. FR-7.

Surfaces 1 and 3 overlap at `skills/project-cleanup/SKILL.md`, which both invokes `review_panel.js` (FR-1) and carries scaffolding under audit (FR-8). Sequence those to avoid a conflicting edit.

## Design Passes

### Subdomain classification

| Epic | Subdomain | Reasoning |
|---|---|---|
| `verification-deduplication` | core | The agent graph is the product's differentiating logic and carries a real invariant: review coverage must not be lost while removing a reviewer |
| `agent-tiering` | core | Tier assignment encodes genuine domain rules about which work needs which capability |
| `prompt-surface-detox` | core | The prompt text *is* the deliverable |
| `installer-source-checkout-fix` | supporting | Necessary, not differentiating; a path-resolution bug fix |

### Pattern-naming pass

Most of this work is deletion and constant assignment, which warrants no pattern. One candidate only:

> **Strategy — because tier resolution may need to vary by session model family (tiering down from an already-inexpensive session model is meaningless and must be suppressed); revisit at build (may collapse to a function or simpler form if the variation does not materialize).**

No other Gang of Four pattern is justified. A stage-to-tier map is a constant object; introducing an abstraction over it would violate the Arbitration Rule.

## Implementation Plan

1. **`verification-deduplication`** — FR-1, FR-2, FR-3. Touches `sprint_pipeline.js`, `adversarial_verify.js`, `review_panel.js`, `project-cleanup/SKILL.md`, `project-emulate/SKILL.md`.
2. **`agent-tiering`** — FR-4. Touches every `lib/workflows/*.js`. Depends on (1) because both edit `sprint_pipeline.js` and `adversarial_verify.js`, and (1) may delete stages this epic would otherwise tier.
3. **`prompt-surface-detox`** — FR-5, FR-6, FR-8. Depends on (1) because both edit `project-cleanup/SKILL.md`.
4. **`installer-source-checkout-fix`** — FR-7. Independent; may run in parallel with any of the above.

## Testing Strategy

- **Unit** — `resolveSkillsDir()` gains cases for source checkout, `node_modules` install, and global install. The tier resolver gains cases for each stage and for the already-inexpensive-session-model degradation path.
- **Structural** — a test asserting every `agent()` call in `lib/workflows/` supplies an explicit tier, so future stages cannot silently inherit the session tier.
- **Regression** — existing `inline_sync` tests must still pass; FR-2's edit to `adversarial_verify.js` must not disturb the inlined `normalize_args` block, which is DRY-checked against `_shared/normalize_args.mjs`.
- **Acceptance** — static agent-count per story and per finding, compared against the `opus-4-8` tag (`fb67d42`). Emulation phase runs and must surface no new Critical findings.

## Risks

| Risk | Mitigation |
|---|---|
| Removing `review_panel` drops security-lens coverage the per-story review doesn't replicate | Fold the security lens prompt into the per-story review prompt, or retain a single scoped security lens |
| Haiku is insufficient for the `pr` stage on GitHub-mode repos | `pr` returns a schema-validated result; a failure is visible, not silent. Reassess if the schema rejects |
| Baseline trim removes stance an agent relied on | Arbitration Rule, Emergence priorities, and precedence order are preserved verbatim; only canon restatement is cut |
| Editing skills while running them | The run edits `skills/`; the harness runs from the `.claude/skills/` snapshot, so no mid-run mutation |

## Future Considerations

- Per-run token accounting would turn NFR-2's static count into a measured figure. Absent instrumentation, static counting is the verifiable proxy.
- If Opus 5's `low`/`medium` effort proves as strong here as documented, the `implement` stage may also drop a tier — measure before assuming.
- `.claude/skills/` drift caused a stale install (missing `_workflows/` entirely). A sync check at orchestrate startup would catch it earlier.
