# ADR-0002: Multi-Spec Sequential Orchestration

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Keith Garcia (project owner)

## Context

`/project-orchestrate` accepted a single PRD path (or repo identifier, or nothing) and had undefined behavior when given multiple PRD paths. When a user invoked `/project-orchestrate spec-1.md spec-2.md ... spec-10.md`, an executing agent improvised a merge policy at runtime — typically treating all specs as one unified multi-spec project. That produced incoherent design-spike artifacts (one ADR trying to summarize unrelated specs), unpredictable sprint mixing across specs, and run-to-run inconsistency because the merge semantics were agent-invented.

The spec at `docs/specs/20260527_215752_multi_spec_sequential_orchestration.md` analyzed the failure modes and proposed formalizing multi-path invocation as **sequential per-spec orchestration**. This ADR records the architectural decisions made in that spec and confirms them as accepted after implementation in this orchestration run (v1.8.0).

## Decision

Adopt **sequential per-spec orchestration** as the default behavior for multi-path `/project-orchestrate` invocations. Each PRD path in the argument list receives its own complete, isolated orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) before the next spec begins. Inter-spec execution order respects optional `depends_on` PRD frontmatter declarations via topological sort with stable tie-break on argument order.

### Mode Classification

Add an explicit "Input Parsing and Mode Detection" section to `project-orchestrate/SKILL.md` documenting seven invocation patterns: no-arg (existing), single-spec (existing), repo-identifier (existing), single-spec + repo (existing), sequential multi-path (new), multi-repo (ERROR), and mixed-args (ERROR). Flag tokens (starting with `--`) are separated from argument tokens before classification.

### Dependency Resolution

PRD documents declare optional `depends_on: [<path-or-basename>, ...]` frontmatter. Dependency graph is constructed at run start, before any spec executes. Cycles (including self-loops) and missing dependencies abort with explicit error messages listing the offending entries. Topological sort breaks ties by original argument order, ensuring deterministic execution.

### Per-Spec Isolation

Each spec's orchestration is independent: own scaffold call, own design-spike decision, own emulation hardening loop, own cleanup, own ADR generation. No cross-spec contamination. The two-pass scaffolding and design-spike epic features (v1.7.0) operate per-spec and integrate cleanly.

### State File Lifecycle

In multi-path mode, per-spec state files are archived to `.claude-scrum-skill/orchestration-state-<spec-slug>.previous.md` on completion (or `.skipped.md` on `--skip-on-pause` pause). The per-spec orchestration's Step 17 cleanup is suppressed; the wrapper handles archival. Spec slug is `basename(path, ".md")`; slug collisions abort before run.

### Queue State File

A new artifact `.claude-scrum-skill/orchestration-queue-state.md` tracks the multi-path run: resolved execution order, per-spec status, dependency graph, aggregate stats, append-only log. Resumable on safety-gate pause; archived to `.previous.md` on clean completion. The single-spec state file (`orchestration-state.md`) lifecycle is unchanged from v1.7.1.

### Opt-In Flags

- `--skip-on-pause` (default off) — advance the queue when a spec hits a safety gate instead of pausing the run.
- `--merged` (default off) — preserve the legacy unified-multi-spec behavior with a deprecation-style warning. Formal merged semantics deferred to a follow-up spec.

### Backward Compatibility

Single-path, repo-identifier, single-spec + repo, and no-arg invocations are unchanged from v1.7.1. The new behavior is purely additive at the Input Parsing layer.

## Consequences

### Positive

- **Predictable multi-spec behavior.** Users get the most natural invocation (`/project-orchestrate spec-1.md spec-2.md ...`) without spelling out "one at a time, end-to-end" in their prompt; the skill default does what they expect.
- **Per-spec design coherence.** Each spec retains its own design-spike (if triggered), its own ADR, its own emulation findings. No incoherent merged ADRs trying to summarize unrelated work.
- **Inter-spec ordering control.** `depends_on` frontmatter lets PRD authors declare ordering constraints. Catches cycle/missing-dep errors up front rather than producing wrong-order execution at runtime.
- **Failure isolation.** A safety-gate pause on one spec doesn't poison the rest of the queue. The user resolves and resumes; remaining specs proceed.
- **Resumable.** The queue state file's recorded execution order takes precedence on resume, preventing subtle ordering shifts mid-run if `depends_on` frontmatter changes between attempts.
- **Backward compatible.** Existing single-spec users see no change in v1.7.1 → v1.8.0 behavior for their invocation patterns.

### Negative

- **Sequential is slow for many specs.** 10 specs sequentially is 10× one orchestration — potentially hours per run. No parallelism option in v1.8.0; users with many specs may need to chunk manually.
- **Slug-collision constraint.** Two specs with the same basename (`foo/spec.md` and `bar/spec.md`) can't be in the same invocation. Forces users to keep basenames unique across their specs directory.
- **`--merged` is technical debt by design.** The flag accepts the multi-path arguments but defers semantics to a follow-up spec. Users who depend on merged behavior may accumulate undocumented assumptions about how the legacy path works; future formalization could become a breaking change.

### Neutral

- **New queue state file format.** Internal contract that may evolve. Human-readable markdown, recoverable by hand if schema changes between runs.
- **Slug-suffix state archives.** New file naming convention only in multi-path mode. Single-spec mode keeps the v1.7.1 unsuffixed `.previous.md` lifecycle. Both coexist cleanly.
- **Dependency validation runs before any spec executes** (NFR-3). Adds a small latency overhead for the topo-sort/cycle-detection pass; negligible at realistic spec counts.

## Alternatives Considered

### Treat multiple PRD paths as one merged project (the v1.7.x undefined default)

Continue letting the agent improvise a merge policy. Rejected because:
- Run-to-run inconsistency makes the feature unreliable.
- Design-spike coherence dissolves when one ADR tries to summarize unrelated specs.
- Safety-gate pauses affect all specs simultaneously, including the ones that would have succeeded.

This is the behavior preserved (with a deprecation warning) under the opt-in `--merged` flag.

### Run each spec via a separate `/project-orchestrate` invocation, no multi-path support

Force users to invoke the skill once per spec. Rejected because:
- Loses the natural one-command UX (`/project-orchestrate spec-1.md spec-2.md spec-3.md`).
- Doesn't address the underlying problem — the v1.7.1 default behavior for multi-path is undefined; users get unexpected results when they try.
- Requires users to handle queue progression manually (e.g., shell loop) and merge cumulative summaries.

### Parallel multi-spec execution

Run N specs concurrently up to a concurrency cap. Rejected for v1.8.0 (out of scope per the spec) because:
- Requires per-spec working directories or git worktrees to avoid branch conflicts.
- Separate state file paths per spec, parallel sprint plans without interference.
- Different summary aggregation model.
- Safety-gate handling becomes much harder (does one paused spec halt the parallel siblings?).

A `--parallel` flag could be a future enhancement once sequential is proven.

### Per-spec dependency graphs in one combined backlog (no queue file)

Treat the multi-spec invocation as one giant project, but use `depends_on` to gate cross-spec story execution within a single sprint plan. Rejected because:
- Defeats the per-spec isolation goal — sprints mix work across specs, design-spikes get merged.
- Forces all specs to share the same sprint cadence, velocity target, and review cycle.
- Hard to roll back a single spec's work without disturbing siblings.

## References

- Source spec: `docs/specs/20260527_215752_multi_spec_sequential_orchestration.md`
- Previous ADR: `docs/adrs/0001-two-pass-scaffolding-and-design-spike-epic.md` (this ADR builds on the v1.7.0 two-pass + design-spike work; per-spec isolation preserves their semantics)
- Modified skill: `skills/project-orchestrate/SKILL.md` (Input Parsing and Mode Detection section, Sequential Multi-Path Mode section, Phase 3 Step 17 suppression note, Before You Start additions)
- Modified shared: `skills/shared/references/CONVENTIONS.md` (PRD Document Frontmatter subsection)
- README additions: Invocation Patterns table, Multi-Path Flags subsection, Inter-Spec Dependencies subsection, Tip about declaring depends_on
- Emulation report: `.claude-scrum-skill/reports/emulation-report/ISSUES.md` (run 1: 2 warnings) and `ISSUES-run-2.md` (clean after hardening)
- Cleanup report: `.claude-scrum-skill/reports/cleanup-report/SUMMARY.md` (all phases SKIP/PASS)
- Released as: npm v1.8.0
