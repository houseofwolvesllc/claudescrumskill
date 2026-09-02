# Stage-Timing Telemetry for Workflow Scripts

## Overview

Workflow scripts (`lib/workflows/*.js`) run each pipeline stage as an `agent()`
call, but nothing records how long each stage takes. Wall-clock questions — "is
verification actually the cost, or is it implement?" — can today only be answered
by post-hoc archaeology over archived agent transcripts, which is fragile and
breaks under worktree parallelism (spawn order ≠ stage order). Every `agent()`
call already carries a `label` and a `phase`, so attribution exists; only
duration is missing.

This feature adds a single timing wrapper that all `agent()` calls route
through. It records a per-stage **interval** (`{ label, phase, startedAt,
endedAt }`, ISO-8601) and the workflow returns the collected intervals to the
main thread on a `_telemetry` field. Collection and return are **unconditional**.
A `telemetry.report` key in `config.json` (default `true`), read only by the
reporting SKILL.md layer, decides whether the main thread **renders** the timing
section. Production is always-on and flag-free; presentation is config-gated at
the skill layer, consistent with every other config key.

The measurement value proven out during investigation: on the archived Opus 5
run, implement was 55% of wall-clock and verify only ~12% — the opposite of the
"verification dominates" premise. This feature makes that answer available on
every real run, on the parallel runs where transcript archaeology cannot map
stages.

## Objectives

-   **Primary**: Capture per-stage wall-clock as ISO-8601 intervals via one
    reusable, injectable, unit-tested timing wrapper, and return them from the
    workflow to the main thread on a `_telemetry` field — with zero change to
    what any stage does.
-   **Primary**: Gate only the *rendering* of timings behind a `telemetry.report`
    config key read at the SKILL.md layer; never gate collection, and never add
    a boolean flag argument to a workflow.
-   Secondary: Render a stage-timing section (summed-stage cost and critical-path
    wall-clock, both derived from intervals) in `sprint-status`, `sprint-release`,
    and the `project-orchestrate` post-run summary.
-   Secondary: Keep the timer script-agnostic so extending it to
    `adversarial_verify.js` / `elaborate_epics.js` later is trivial, without
    wiring scripts no consumer yet renders (Arbitration Rule).

## Requirements

### Functional Requirements

-   **FR-1** — A new `lib/workflows/_shared/stage_timing.mjs` exports a pure
    factory `createStageTimer(agentFn)` returning `{ timedAgent, timings }`:
    -   `timedAgent(prompt, opts)` awaits `agentFn(prompt, opts)`, records
        `startedAt` before the call and `endedAt` after, appends
        `{ label: opts.label, phase: opts.phase, startedAt, endedAt }` to
        `timings`, and returns the awaited result **unchanged**.
    -   `timings` is the accumulating array the workflow reads at return time.
-   **FR-2** — `agentFn` is **injected**, not closed over a runtime global, so the
    module is unit-testable in isolation (the workflow runtime's `agent` global
    is not present under `node --test`). The workflow script builds the timer once
    at the top: `const { timedAgent, timings } = createStageTimer(agent)`.
-   **FR-3** — Timestamps are ISO-8601 wall-clock (`new Date().toISOString()`),
    **not** `performance.now()`. Absolute instants are required so intervals from
    concurrent stories compose onto one timeline and match the
    `artifact_freshness` ISO convention already established in `_shared`.
-   **FR-4** — The interval is recorded whether the stage **succeeds, returns
    `null`, or throws**. `endedAt` is stamped in a `finally`; a soft `null`
    return flows through unchanged, and a thrown error is recorded then
    **re-thrown** so the script's existing error handling is unaffected.
-   **FR-5** — `stage_timing` is registered in `INLINE_MANIFEST`
    (`lib/workflows/_shared/inline_manifest.mjs`) for each wired script, expanded
    by `bin/regen_workflow_inlines.mjs`, and covered by the drift guard
    (`inline_sync.test.mjs`).
-   **FR-6** — `sprint_pipeline.js` routes **every** `agent()` call
    (`detect-layout`, `implement`, `review`, `verify`, `pr`, `reset`,
    `teardown`) through `timedAgent`, and its workflow return value gains a
    top-level `_telemetry` array of the collected intervals.
-   **FR-7** — The workflow return schema is extended so `_telemetry` is a
    described, validated field. The `_` prefix marks it as out-of-band so
    consumers iterating story results skip it.
-   **FR-8** — `config.json` default gains `telemetry.report` (boolean, default
    `true`). The install-time merge (`bin/install.js`) preserves a user's
    existing value, exactly as it does for other keys.
-   **FR-9** — `sprint-status`, `sprint-release`, and `project-orchestrate` read
    `telemetry.report` from `../shared/config.json`. When `true`, they render a
    stage-timing section from the workflow's `_telemetry`; when `false`, they
    omit it. The `_telemetry` payload is present on the return regardless.
-   **FR-10** — The rendered section reports, per `phase`/`label`: summed stage
    duration, count, and share; plus overall **critical-path wall-clock**
    (`max(endedAt) − min(startedAt)`) distinguished from **summed-stage cost**
    (`Σ(endedAt − startedAt)`), so parallel overlap is not double-counted.

### Non-Functional Requirements

-   **NFR-1 (ADR-0006 compliance)** — Uses only `Date` (a language builtin). No
    `import`/`require`, no filesystem, no `child_process` in the workflow path.
-   **NFR-2 (transparency)** — No stage's behavior, inputs, outputs, ordering, or
    error semantics change. The wrapper is observationally invisible except for
    the added `_telemetry` return field.
-   **NFR-3 (cost)** — Two `Date` reads per stage; return-payload growth is
    `O(stages)` of tiny records. Negligible.
-   **NFR-4 (clean code)** — No boolean flag argument on any workflow. The timer
    is one earned abstraction (a wrapper used by every stage), consistent with
    `_shared` naming (`snake_case.mjs`, `camelCase` exports).
-   **NFR-5 (backward compatibility)** — Consumers not yet updated ignore
    `_telemetry`. Any workflow whose current return is a bare array (not an
    object) must be reconciled so adding `_telemetry` is non-breaking; the
    current return shape is verified before wiring (see Design Concerns).

## Technical Specifications

-   **Language/Framework**: Node ESM (`.mjs` canonical `_shared` module; `.js`
    workflow scripts). `node --test` for tests. No new dependencies.
-   **Dependencies**: None. `Date` only.
-   **Key Components**:
    -   `lib/workflows/_shared/stage_timing.mjs` — pure factory (new).
    -   `lib/workflows/_shared/stage_timing.test.mjs` — behavior tests (new).
    -   `lib/workflows/_shared/inline_manifest.mjs` — register module.
    -   `lib/workflows/sprint_pipeline.js` — route calls, extend return + schema.
    -   `skills/shared/config.json` — `telemetry.report` default.
    -   `bin/install.js` — merge preserves user value (existing mechanism).
    -   `skills/sprint-status/SKILL.md`, `skills/sprint-release/SKILL.md`,
        `skills/project-orchestrate/SKILL.md` — conditional render.
-   **Data Structures**:
    -   Interval: `{ label: string, phase: string, startedAt: string /*ISO*/,
        endedAt: string /*ISO*/ }`.
    -   Return: existing payload + `_telemetry: Interval[]`.
    -   Config: `{ "telemetry": { "report": true } }`.
-   **APIs/Interfaces**:
    -   `createStageTimer(agentFn) → { timedAgent(prompt, opts), timings }`.

### Reference implementation sketch (illustrative, not binding)

```js
// lib/workflows/_shared/stage_timing.mjs
export function createStageTimer(agentFn) {
  const timings = []
  async function timedAgent(prompt, opts) {
    const startedAt = new Date().toISOString()
    try {
      return await agentFn(prompt, opts)
    } finally {
      timings.push({
        label: opts.label,
        phase: opts.phase,
        startedAt,
        endedAt: new Date().toISOString(),
      })
    }
  }
  return { timedAgent, timings }
}
```

```js
// in sprint_pipeline.js, once, after `agent` is in scope:
const { timedAgent, timings } = createStageTimer(agent)
// every stage call becomes `await timedAgent(prompt, { label, phase, ...tier })`
// workflow return: { ...existingReturn, _telemetry: timings }
```

## User Experience

-   **Default (`telemetry.report: true`)**: after a sprint run, `sprint-status`
    and the orchestrate summary print a stage-timing table — e.g. per phase:
    summed duration, share, count, and the run's critical-path wall-clock vs.
    summed-stage cost.
-   **Opt-out (`telemetry.report: false`)**: no timing section renders; the
    workflow still returns `_telemetry`, so a user can re-enable and re-read
    without a re-run if the return is retained.
-   **Workflow authors**: write `timedAgent(...)` instead of `agent(...)`; no
    other change. The timer is created once per script.

## Architecture

-   **Data flow**: `timedAgent` (inlined in the workflow) → `timings` array →
    workflow `return._telemetry` → Workflow tool completion payload → main
    thread → reporting SKILL.md reads `telemetry.report` from `config.json` →
    renders or omits.
-   **System boundary (ADR-0006)**: the workflow runtime cannot read
    `config.json`; the config value never reaches the workflow, and it does not
    need to — collection is unconditional, so no gating value crosses the
    boundary. Only the SKILL.md layer (which can read files) consults the key.
-   **Layering**: capture is a pure `_shared` module (dependency-inverted via
    injected `agentFn`); integration wires it into the script; rendering is skill
    markdown. Each layer depends only upward through the interval contract.
-   **Integration points**: `INLINE_MANIFEST`/regen/drift discipline for the new
    module; the workflow return contract; `config.json` + install merge; three
    reporting SKILL.md consumers.

## Implementation Plan

1.  **E1 — telemetry-capture**: TDD `stage_timing.mjs` (`createStageTimer`) with
    `stage_timing.test.mjs` first; register in `INLINE_MANIFEST`; run
    `regen_workflow_inlines.mjs`; extend `inline_sync.test.mjs` coverage.
2.  **E2 — pipeline-telemetry-return**: verify `sprint_pipeline.js`'s current
    return shape; build the timer once; route every stage `agent()` through
    `timedAgent`; attach `_telemetry` to the return; extend the return schema.
3.  **E3 — telemetry-reporting**: add `telemetry.report` default to `config.json`
    (merge-preserving); render the timing section in `sprint-status`,
    `sprint-release`, and the `project-orchestrate` summary, gated on the key.

## Testing Strategy

-   **Unit (`stage_timing.test.mjs`, tests-first)**:
    -   records one interval per call with the call's `label`/`phase` and
        `startedAt ≤ endedAt` in ISO-8601.
    -   returns the `agentFn` result unchanged (transparency), including a `null`
        result.
    -   records the interval **and re-throws** when `agentFn` throws.
    -   accumulates intervals across multiple and concurrent calls; empty run
        yields `[]`.
-   **Drift (`inline_sync.test.mjs`)**: the inlined `stage_timing` block in each
    wired script is byte-identical to canonical.
-   **Integration**: `sprint_pipeline` returns `_telemetry` with one interval per
    stage executed; a stage that returns `null` or throws still appears.
-   **Rendering**: reporting skills omit the section when `telemetry.report` is
    `false` and print it when `true`; critical-path wall-clock ≤ summed-stage
    cost whenever any stages overlap.

## Design Passes

### Engineering baseline

Assumes `ENGINEERING_BASELINE.md`: tests-first (red-green-refactor) for the
`_shared` module, and the **Arbitration Rule** — the timer is a single earned
wrapper used by every stage (not anticipatory), and scope is held to the one
script a consumer renders. No abstraction is added for the not-yet-wired scripts.

### Strategic domain pass (DDD)

Ubiquitous language: **stage**, **phase**, **label**, **interval**
(`startedAt`/`endedAt`), **telemetry**, **summed-stage cost**, **critical-path
wall-clock**. No `core` subdomain — this is observability plumbing over an
existing pipeline. Capture and integration are **supporting** (they give the
project first-class, evidence-based measurement aligned with its
distrust-the-actor ethos); reporting is **generic** (read config, format a
table). No tactical aggregates warranted.

### Pattern-naming pass (GoF), candidate only

> **Decorator** — because `agent()` invocation needs an orthogonal timing concern
> layered on without altering call sites or the agent contract; revisit at build
> (will almost certainly collapse to the plain higher-order wrapper in the sketch,
> since only one concern — timing — is ever layered).

No other pattern is warranted; the remaining work is config reads and table
formatting (generic).

## Future Considerations

-   **Extend to other scripts**: wire `adversarial_verify.js` (note it uses
    `parallel()` — concurrent `timedAgent` calls push overlapping intervals,
    which is correct and the reason intervals beat durations) and
    `elaborate_epics.js` once a consumer renders their telemetry. The timer is
    already script-agnostic; wiring is a manifest entry plus the one-line timer
    construction. Deliberately deferred per the Arbitration Rule.
-   **Persisted history**: the main thread could append `_telemetry` to a report
    artifact for cross-run trend analysis. Out of scope; explicitly no
    auto-tuning or control loop consumes timings (n=1 timings are noise — report,
    don't close a loop).
-   **Intra-stage timing** (e.g. verify's re-provision-vs-build split) remains out
    of scope: it requires the agent self-reporting its own steps, trusting the
    actor's account of itself, against the `artifact_freshness`/EM-201 principle.

## Design Concerns / Open Decisions

-   **Return-shape reconciliation**: confirm `sprint_pipeline.js`'s current
    top-level return is an object (so adding `_telemetry` is additive) rather than
    a bare array; if it is an array, wrapping it is a breaking contract change and
    the consuming SKILL.md read must be updated in the same epic.
-   **Scope of wiring (needs sign-off)**: this spec wires **only
    `sprint_pipeline.js`**, the sole rendered consumer, per the Arbitration Rule —
    even though the timer is built to serve all three scripts. The original ask
    listed all workflow scripts; wiring `adversarial_verify.js` /
    `elaborate_epics.js` now would add code no consumer renders. Confirm the
    narrowed scope, or promote the other two into E2.
-   **Config key shape**: `telemetry.report` (nested) is chosen to match
    `scaffold.design_spike_enabled` / `paths.*` nesting and leave room for future
    telemetry sub-keys; a flat `telemetry` boolean is the alternative.
