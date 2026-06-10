# ADR-0003: Workflow-Backed Re-Plumbing of Skill Internals

- **Status:** Accepted
- **Date:** 2026-05-30
- **Deciders:** Keith Garcia (project owner)

## Context

Through v1.8.x, claudescrumskill encoded its fan-out, journaling, and cross-skill hand-offs as policy prose inside markdown SKILL.md documents. The model worked, but it produced three structural limits:

1. **Cross-skill hand-offs go through markdown round-trips.** `/project-spec` produces markdown; `/project-scaffold` re-parses it; `/project-scaffold` produces a file-based backlog; `/project-orchestrate` re-reads the files. Every boundary is a free-text interpretation step that drifts and forces rework.
2. **Parallelism capped at 3 with per-stage barriers.** The v1.x Task-based fan-out in `/project-orchestrate` Phase 1 Step 3 and `/project-scaffold` Pass 2 ran at concurrency 3 and waited for each stage to fully complete. On 10+ story sprints this is real wall-clock cost.
3. **Verbose policy prose competes with autonomous execution.** Long "spawn N subagents and..." sections in SKILL.md invite interpretation rather than execution, even with the v1.7.1 imperative autonomous-default rewrite.

Claude Code introduced the Workflow tool — a deterministic JavaScript orchestration substrate with `agent()`, `parallel()`, `pipeline()`, schema-validated returns, journal-based resume, and concurrency up to 16. The substrate maps cleanly onto the fan-out patterns the skills had been describing in prose.

The source spec at `docs/specs/20260529_170334_workflow_backed_re_plumbing.md` analyzed the choice and proposed v2.0.0 as a re-plumbing: keep every skill's markdown surface and slash-command name unchanged, but migrate the fan-out internals to workflow scripts shipped with the npm package.

## Decision

Adopt **a two-layer architecture for v2.0.0+**:

- **Skills (markdown SKILL.md)** own the *opinion* (which phases run, when, in what order, with what artifacts) and the *user surface* (slash commands users type). Skills install to `~/.claude/skills/<skill>/SKILL.md` via `bin/install.js`. They remain the entry point and the source of project conventions.
- **Workflow scripts (JavaScript at `lib/workflows/`)** own the *substrate* — the actual fan-out, schema-validated returns, and journal-based resume. They install alongside skills at `~/.claude/skills/_workflows/`. Skills invoke them via the Claude Code Workflow tool using a Path Resolution Algorithm (walk up from SKILL.md to the skills root, then descend into `_workflows/`).

### Four workflow scripts shipped in v2.0.0

| Script | Replaces | Concurrency change |
|--------|----------|--------------------|
| `sprint_pipeline.js` | `/project-orchestrate` Phase 1 Step 3 Task-spawning prose | hardcoded 3 → up-to-`min(16, cpu_cores - 2)`, barriers removed (barrier removal is the unconditional gain; concurrency lift depends on host) |
| `elaborate_epics.js` | `/project-scaffold` Pass 2 Task-spawning prose | hardcoded 3 → up-to-`min(16, cpu_cores - 2)`, one wave instead of N rounds |
| `adversarial_verify.js` | New (lifts emulation findings from "trust the emulator" to claimant/skeptic/judge verdicts) | up to N findings × 3 agents each |
| `review_panel.js` | `/project-cleanup` single-pass review | 4 lenses in parallel |

The multi-spec sequential queue is implemented in the skill markdown (not as a workflow) because the per-spec body invokes the per-skill workflows above, and the Workflow tool's "one level of nesting only" constraint precludes a queue-workflow → per-spec-workflow → leaf-workflow chain. This is documented as a deliberate choice; future tool-level relaxation of the nesting constraint could collapse the queue back into a workflow.

`/code-review` was originally listed as a rewrite target in the source spec. It is a Claude Code first-party skill not in this package; the v2.0.0 review-panel work is scoped to `/project-cleanup` only.

### Eight JSON Schemas as the cross-skill type system

`SpecSchema`, `EpicSchema`, `StorySchema`, `EmulationFindingSchema`, `ReviewVerdictSchema`, `SprintStoryReturnSchema`, `ScaffoldOutputSchema`, `PRDFrontmatterSchema` (all JSON Schema Draft 2020-12). Workflows return schema-validated structures; consuming skills no longer re-parse markdown.

### Runtime requirement

v2.0.0 requires a Claude Code version that exposes the Workflow tool. The major version bump signals this hard runtime requirement change. v1.8.x remains on npm as the fallback for older Claude Code installs.

### Distribution

`bin/install.js` is updated to copy both `skills/` and `lib/workflows/` during postinstall. The workflows install to `<install-dir>/_workflows/` (underscore prefix prevents Claude Code from registering the directory as a skill).

## Consequences

### Positive

- **Predictable, schema-validated cross-skill hand-offs.** Every workflow return is validated against a JSON Schema before consumption. No more markdown re-parsing at boundaries.
- **Wall-clock improvement on multi-story sprints.** Concurrency 3 → 16, per-stage barriers removed. Measurable improvement on sprints with 5+ stories.
- **Reduced policy prose.** Hundreds of lines of "spawn N parallel Tasks..." narrative in SKILL.md files become 20-50 line workflow scripts plus thin invocation directives in the skills.
- **Adversarial verification of findings.** `adversarial_verify.js` provides a structured claimant/skeptic/judge pass on every emulation finding before it drives hardening, cutting false-positive cycles.
- **Multi-lens review.** `review_panel.js` runs correctness/security/style/tests lenses in parallel with aggregated verdicts, surfacing concerns single-pass review misses.
- **Backward-compatible user surface.** Every slash command, every prompt, every artifact format (state files, ADRs, CONTEXT.md) is unchanged. Users see no UX change.
- **Plugin install path works.** Path Resolution Algorithm computes the workflow script absolute path from SKILL.md's load location — works identically for global, local, and plugin install layouts.
- **Layered model is documentable.** Skills = opinion. Workflows = substrate. Agents = workers. The architecture is teachable and contributors can add new workflows without touching the skill markdown for unrelated skills.

### Negative

- **Hard runtime dependency on the Workflow tool.** The first time the project has required a specific Claude Code feature beyond the basic tool set. Users on stale CLI installs without auto-update must update Claude Code (or install v1.8.x as a fallback). Most users on modern Claude Code already have it.
- **New maintenance surface.** JavaScript workflow scripts join the markdown skills as code the project must maintain. Workflow tool API drift over time is a real risk; pin to documented primitives only (`agent`, `parallel`, `pipeline`, `workflow`).
- **NFR-6 line-reduction target not yet met.** Source spec called for ≥30% reduction in `project-orchestrate/SKILL.md`; actual reduction is ~5%. The Task-spawning prose IS gone, but other reference material (queue state file format, per-spec lifecycle table) remained. Future cleanup candidate.
- **Workflow scripts cannot nest more than one level.** This is a Workflow tool constraint. `multi_spec_queue.js` invokes a `per-spec-orchestration` sub-workflow once per spec; the sub-workflow cannot itself call further workflows. Designed around this; future tool relaxation would simplify.
- **First-time author of JavaScript in this project.** Up through v1.8.1 the package was markdown + JSON + a single Node install script. v2.0.0 introduces 5 substantive JavaScript files. Test/lint tooling for JS is now in scope for future hardening passes.

### Neutral

- **State files keep their v1.8.x markdown format.** Workflows write to the state files via their agents' Bash tool access. Cross-session resume continues to work via the skill's reading of state files (workflow's own journal handles in-session resume only).
- **Per-spec ADR generation unchanged.** Each per-spec orchestration still produces its own ADR; the queue workflow doesn't override that.
- **Schemas live at `lib/workflows/schemas/`.** Shared between workflows and skill markdown (which references the schemas for cross-skill type contracts). Could conceivably move to `skills/shared/schemas/` in a future version if that's a better fit.

## Alternatives Considered

### Full rewrite to a single workflow per skill (no markdown surface)

Make each skill a JavaScript workflow file with no SKILL.md. Rejected because:

- Loses the slash-command user surface (workflows must be invoked by the assistant, not typed by the user).
- Loses the markdown discoverability — users browse SKILL.md to learn what a skill does.
- Loses the design-spike epic / CONTEXT.md / ADR durable repo artifacts that are inherently markdown.
- Throws away the v1.x work for marginal additional gain.

### Keep status quo (no workflow integration)

Continue refining the markdown-only approach. Rejected because:

- The structural limits (parallelism cap, per-stage barriers, markdown re-parsing) are real and reduce orchestration throughput.
- The Workflow tool is exactly the right substrate; not using it leaves observable performance on the table.

### Hybrid: keep v1.x fallback paths in SKILL.md

Maintain both the v1.x Task-spawning prose AND the v2.0.0 workflow invocation in the same SKILL.md, choosing at runtime based on Workflow tool availability. Rejected because:

- Doubles the SKILL.md size (defeats the "reduce verbose prose" goal).
- Forces the executing agent to choose between two paths at every fan-out point — adds rather than removes complexity.
- v1.8.x already exists on npm as a clean fallback for users without the Workflow tool. The runtime check + clean failure-mode messaging is the right interface for that case.

### Workflows as a separate npm package

Ship `@houseofwolvesllc/claude-scrum-skill-workflows` separately. Rejected because:

- Splits versioning unnecessarily — workflows and skills evolve together.
- Adds an install step (or peer dependency) for marginal benefit.
- Workflow scripts are small (~150-220 lines each); shipping them alongside skills costs ~10 KB of tarball size. Negligible.

## References

- Source spec: `docs/specs/20260529_170334_workflow_backed_re_plumbing.md`
- Workflow analysis that produced the synthesis: workflow `ww06m54dc` (run 2026-05-29).
- Previous ADRs: `0001-two-pass-scaffolding-and-design-spike-epic.md`, `0002-multi-spec-sequential-orchestration.md`. v2.0.0 preserves both behaviors; the Pass 2 fan-out moves into a workflow but the design-spike semantics and sequential multi-spec semantics are unchanged.
- Modified skills: `skills/project-orchestrate/SKILL.md`, `skills/project-scaffold/SKILL.md`, `skills/project-emulate/SKILL.md`, `skills/project-cleanup/SKILL.md`, `skills/project-spec/SKILL.md`.
- Workflow scripts: `lib/workflows/{sprint_pipeline,elaborate_epics,multi_spec_queue,adversarial_verify,review_panel}.js`.
- Schemas: `lib/workflows/schemas/*.json` (8 files).
- Modified shared: `bin/install.js` (copies lib/workflows), `package.json` (files field), `README.md` (Architecture section + v2.0.0 runtime callout).
- Released as: npm v2.0.0.
