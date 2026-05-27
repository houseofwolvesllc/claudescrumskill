# ADR-0001: Two-Pass Scaffolding and Design-Spike Epic

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Keith Garcia (project owner)

## Context

`/project-orchestrate` was producing uneven results on large PRDs (30+ pages, multiple epics). Two structural problems caused this:

1. `/project-scaffold` read the entire PRD into a single agent context and produced every epic and every story in one pass. On large inputs, decomposition quality decayed across the document — the first epic got rich, well-bounded stories; the last got terse stubs that forced implementing subagents to invent scope at execution time.
2. Implementation subagents executing stories from the same epic in parallel had no shared design anchor beyond the project's `CLAUDE.md`. The architectural intent that tied an epic's stories together lived only in the PRD, which the subagents never saw. Parallel subagents independently invented naming, file layout, and patterns for shared concerns — surfaced only at the sprint-level review gate, after drift had compounded.

The spec at `docs/specs/20260527_000454_orchestrate_large_prd_hardening.md` analyzed these failure modes and proposed two coordinated changes. This ADR records the architectural decisions made in that spec and confirms them as accepted after implementation in this orchestration run.

## Decision

Adopt **two-pass scaffolding** and an auto-injected **design-spike epic** in `/project-scaffold` and `/project-orchestrate`.

### Two-Pass Scaffolding

When triggered, `/project-scaffold` splits PRD parsing across multiple focused subagents:

- **Pass 1** — one agent reads the whole PRD and emits a structured skeleton manifest (epic names, slugs, descriptions, slice line ranges, dependencies, shared design concerns) plus a global preamble.
- **Pass 2** — one subagent per epic (max 3 concurrent) elaborates that epic's stories with only its assigned PRD slice + the global preamble + a skeleton summary of sibling epics in context.

Triggers in precedence order: CLI flag → PRD frontmatter override → word count threshold (`scaffold.two_pass_threshold_words`, default 5000). Auto-downgrades to single-pass elaboration when Pass 1 yields ≤ 2 epics. Failures degrade gracefully — Pass 1 falls back to single-pass; Pass 2 marks the affected epic's stories `needs-context` and lets sibling subagents continue.

### Design-Spike Epic

When triggered, `/project-scaffold` auto-injects a research-driven pre-epic at position 0 of the project. The design-spike epic contains:

- One ADR-authoring story producing the project's foundational ADR at `<paths.adr>/NNNN-<slug>.md`.
- One CONTEXT.md-authoring story per implementation epic producing `<paths.context>/<epic-slug>/CONTEXT.md` from the shared template.

All stories use `persona: research`. Implementation epics are gated on the design-spike epic via the existing `blocked_by` mechanism — sprint planning naturally excludes implementation stories until their CONTEXT.md exists. During execution, `/project-orchestrate` Step 3 subagents read the per-epic `CONTEXT.md` in addition to `CLAUDE.md` before writing code. Its naming, file layout, types, and patterns sections override generic `CLAUDE.md` conventions for that epic.

Triggers in precedence order: CLI flag → PRD frontmatter (`design_spike: true | false`) → global enable switch (`scaffold.design_spike_enabled`, default `true`) → auto-trigger when two-pass mode is selected with > 1 implementation epic.

### Storage of Design-Spike Artifacts

ADR and CONTEXT.md files are committed to the `development` branch via the filesystem in **all four scaffolding backends** (local, GitHub, Jira, Trello). Git is the universal substrate. Remote backends may additionally surface links via milestone/epic descriptions for discoverability, but the committed files are the single source of truth.

### Detection Signal for Design-Spike Epics

The canonical signal is the `type:design-spike` label (GitHub/Trello/Jira) or `epic_type: design-spike` frontmatter field (local). The default epic title is "Architecture & Design" but the title is not load-bearing. This allows the epic to be renamed without breaking detection during idempotency checks or orchestration gating.

### ADR Numbering

`/project-orchestrate` Step 16 retrospective ADR creation shares a single sequential numbering pool with design-spike-produced ADRs and hand-authored ADRs. Next number is `max(existing_numbers) + 1`; on a fresh project with no ADRs, start at `0001`.

## Consequences

### Positive

- **Even decomposition** across large PRDs — the last epic's stories are now as well-specified as the first because each Pass 2 subagent operates on a tight, focused context.
- **Shared design anchor** per epic — implementation subagents working on related stories no longer independently invent naming, file layout, or patterns for shared concerns. CONTEXT.md is the per-epic source of truth, and the Step 3 prompt makes it binding.
- **Backward compatibility** — small PRDs (single epic, < 5000 words, no frontmatter overrides) continue through the single-pass path unchanged. Existing projects without design-spike epics work unchanged.
- **Backend uniformity** — anchoring artifacts to the filesystem (not per-backend storage) means subagent reading logic does not branch on backend; one path works everywhere.
- **Graceful degradation** — Pass 1 failure falls back to single-pass; Pass 2 failure marks one epic `needs-context` without aborting the whole scaffold.

### Negative

- **Additional scaffolding latency** for large PRDs — Pass 1 adds one round trip before Pass 2 begins. Net latency increase up to ~50% on large PRDs (Pass 2 subagents run in parallel, partially amortizing the cost).
- **Conceptual surface area increased** — the scaffold skill grew from a single procedure per backend to a layered Mode Detection → Two-Pass Procedure → Design-Spike Epic → per-backend procedure flow. Reading the SKILL.md top to bottom takes longer.
- **More moving parts to fail** — Pass 1 / Pass 2 / Story Assembly / design-spike injection each introduce new failure surfaces. The failure-handling subsection mitigates this but does not eliminate it.
- **CLI flag mechanism is aspirational** — there is no formal argument parser in Claude Code skills; the executing agent scans free-text `$ARGUMENTS` for the documented flag tokens. Documented explicitly in the SKILL.md, but a real argument parser would be more robust.

### Neutral

- **Two physical config files** (`skills/shared/config.json` and `.claude/skills/shared/config.json`) — pre-existing pattern from the npm install layout; both must stay in sync for new keys. Not new to this change.
- **CONTEXT.md template enforces seven sections** — provides consistency but adds friction if an epic has no meaningful content for a section. The template guidance is to keep all sections present even if briefly populated.

## Alternatives Considered

### Single-pass with longer context windows

Continue using single-pass scaffolding and rely on increasing context window sizes to handle larger PRDs. Rejected because:

- Larger context does not solve the per-epic attention problem — even with a 200k-token context, a single agent reading a 30-page PRD still produces uneven decomposition. Context size masks but does not cure the problem.
- The fix degrades over time as PRDs continue to grow.
- It does not address the parallel-subagent drift problem at all.

### Per-story design context (no design-spike epic)

Inject design notes into each implementation story's body rather than producing a shared CONTEXT.md per epic. Rejected because:

- Cross-story consistency is exactly the problem CONTEXT.md solves — putting design notes inline means each story has its own copy, which immediately drifts.
- It does not produce a durable artifact (an ADR / CONTEXT.md file on disk) that survives the orchestration run for future readers.
- Sprint planning has no clean way to gate on per-story design notes; the design-spike epic gives the existing `blocked_by` mechanism a natural target.

### Wiki/issue-body storage for design artifacts (per backend)

Store ADRs and CONTEXT.md content in GitHub wiki pages, Jira pages, or Trello card descriptions rather than in the git filesystem. Rejected because:

- Diverges across backends — each backend has different storage and link semantics; subagents would need backend-aware reading logic.
- Requires network round-trips during subagent execution to fetch artifacts; filesystem reads are immediate.
- Hard to version-control alongside the code that consumes them; ADRs and CONTEXT.md belong next to the source they describe.

### Per-story review gate (instead of or alongside the sprint-level review)

Run an automated review on each story PR before merging to the release branch, catching drift before it compounds. Considered worthy but **explicitly deferred** to a future spec to keep this change focused. The hooks in `/project-orchestrate` Step 3 (after each subagent completes) are the natural insertion point for a future implementation.

## References

- Source spec: `docs/specs/20260527_000454_orchestrate_large_prd_hardening.md`
- Modified skills: `skills/project-scaffold/SKILL.md`, `skills/project-orchestrate/SKILL.md`
- Modified shared: `skills/shared/config.json`, `skills/shared/references/CONVENTIONS.md`
- Added templates: `skills/shared/templates/CONTEXT-template.md`, `skills/shared/templates/ADR-template.md`
- Verification fixtures: `docs/specs/_fixtures/small_prd.md`, `docs/specs/_fixtures/large_prd.md`, `docs/specs/_fixtures/README.md`
- Emulation report: `.claude-scrum-skill/reports/emulation-report/ISSUES.md` (run 1 + 4 warnings) and `ISSUES-run-2.md` (clean)
- Cleanup report: `.claude-scrum-skill/reports/cleanup-report/SUMMARY.md`
