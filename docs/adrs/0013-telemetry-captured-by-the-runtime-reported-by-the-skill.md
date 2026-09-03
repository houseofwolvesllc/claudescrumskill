# ADR-0013: Telemetry Captured by the Runtime, Reported by the Skill

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** Keith Garcia (project owner)

## Context

A sprint run's wall-clock could not be attributed to a stage. Every `agent()` call
already carried a `label` and a `phase`, so each turn was *nameable* — but nothing
recorded when it started or ended, so the one question that decides where to spend
optimization effort ("is verification the cost, or is it implement?") could only be
answered by archaeology over archived agent transcripts. That reconstruction is fragile
and, under worktree parallelism, wrong: spawn order is not stage order once stories
interleave.

The obvious place to fix this is also the one place that cannot. The Workflow runtime has
no filesystem and no module loader (ADR-0006): it can read the clock but it cannot write a
timing file, and it cannot read `config.json` to decide whether timing is wanted. So the
capture and the reporting of timing fall on opposite sides of the runtime/skill boundary,
and the design has to respect that split rather than fight it.

## Decision

### 1. The runtime captures unconditionally and returns the data

A single `createStageTimer(agentFn)` wraps the agent-calling function once; every stage
routes through it. It stamps `startedAt` before the call and `endedAt` after, in a
`finally`, so the success, `null`-return, and throw paths each leave exactly one interval
and a thrown stage still re-throws untouched. `agentFn` is injected rather than closed over
the runtime's `agent` global, so the wrapper is unit-testable where that global is absent.

Capture is never gated. The runtime has no way to read the user's preference and no reason
to — the data is cheap and invisible until something reads it. It records every stage and
hands the intervals back.

### 2. Intervals, not durations

Each record is `{ label, phase, startedAt, endedAt }` in ISO-8601 wall-clock, not a bare
duration. Under worktree parallelism stories overlap, so summed durations are not the run's
wall-clock. Absolute instants let a consumer derive both figures — **summed-stage cost**
(`Σ(endedAt − startedAt)`) and **critical-path wall-clock** (`max(endedAt) − min(startedAt)`)
— and keep them honestly distinct. ISO wall-clock, not `performance.now()`, because the
latter is per-process and unanchored and cannot compose across concurrently timed stories.
This is the same absolute-timestamp form `artifact_freshness` reads.

### 3. The return contract carries the timings out-of-band

`sprint_pipeline` returns `{ stories, _telemetry }` where it previously returned a bare
`SprintStoryReturn[]`. The leading underscore marks `_telemetry` out-of-band: a consumer
iterating story outcomes skips it. The reconciliation is not optional — the sole live
consumer (`project-orchestrate`) was updated in the same change, and a schema
(`SprintPipelineReturnSchema`) now describes the shape.

### 4. Persistence and rendering are the skill layer's, gated by config

`config.json` gains `telemetry.report` (default `true`), read only where config can be
read — the `SKILL.md` layer. `project-orchestrate`, which holds the live return, persists
`_telemetry` to `.claude-scrum-skill/reports/stage-timing/` and renders it; `sprint-status`
and `sprint-release`, which never invoke the pipeline, render from that persisted artifact
when it exists and omit the section when it does not. The key gates **presentation, not
capture** — the data always comes back; the config decides only whether the main thread
reports it.

## Consequences

**Positive.** Per-stage wall-clock is answerable on every real run, including the parallel
runs where transcript archaeology cannot map stages. The abstraction is one earned wrapper
used by every stage, not a timer threaded through every call site. No boolean flag argument
was added to any workflow; the toggle lives in config where the suite's other preferences
already live.

**Negative.** The workflow return is now an object, a contract change every future consumer
must honor rather than treating the return as an array. Timing lives in the skill layer for
`sprint-status`/`sprint-release`, so it is only as fresh as the last persisted run — a
deliberate consequence of the runtime being unable to persist its own data.

**Risk accepted.** Persistence is not itself gated on `telemetry.report`: the artifact is
written even when reporting is off (the files are gitignored, and consumers never read them
while gated off). Whether "report off" should also suppress the on-disk artifact is a
presentation-versus-capture judgment left open rather than decided here.

## Scope not taken

Only `sprint_pipeline` is wired; `adversarial_verify` and `elaborate_epics` are not, though
the wrapper is script-agnostic — timing is added where a consumer renders it, not
speculatively. Intra-stage timing (verify's re-provision-versus-build split, the figure
that would most directly settle the cost question) is out: it would require the agent
reporting its own step times, trusting the actor's account of itself, against the principle
ADR-0009 established.

## References

- ADR-0006 (inline shared logic; the runtime has no loader or filesystem) — the boundary this design is shaped by
- ADR-0009 (verify claims, do not attest them) — why intra-stage self-timing is out of scope
- `lib/workflows/_shared/stage_timing.mjs`
- `lib/workflows/schemas/SprintPipelineReturnSchema.json`
