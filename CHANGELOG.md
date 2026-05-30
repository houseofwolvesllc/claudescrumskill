# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-05-30

### Added
- **Two-layer architecture** (see [ADR-0003](docs/adrs/0003-workflow-backed-re-plumbing.md)): skills (markdown SKILL.md) own the opinion + user surface; workflow scripts (JavaScript at `lib/workflows/`) own the fan-out substrate. Skills invoke workflows via the Claude Code Workflow tool using a Path Resolution Algorithm (walk up from SKILL.md to the skills root, then descend into `_workflows/`).
- **5 workflow scripts** at `lib/workflows/`: `sprint_pipeline.js` (per-story sprint execution as a pipeline), `elaborate_epics.js` (Pass 2 of two-pass scaffolding as one parallel wave), `multi_spec_queue.js` (sequential per-spec queue with one-level sub-workflow nesting), `adversarial_verify.js` (claimant/skeptic/judge verification of emulation findings), `review_panel.js` (multi-lens parallel review with aggregated verdict).
- **8 JSON Schemas** at `lib/workflows/schemas/`: `SpecSchema`, `EpicSchema`, `StorySchema`, `EmulationFindingSchema`, `ReviewVerdictSchema`, `SprintStoryReturnSchema`, `ScaffoldOutputSchema`, `PRDFrontmatterSchema` (all JSON Schema Draft 2020-12). Cross-skill type system for schema-validated workflow returns.
- **`bin/install.js`** copies `lib/workflows/` to `<install-dir>/_workflows/` during postinstall (underscore prefix prevents Claude Code from registering it as a skill).
- **README "Architecture" section** for contributors documenting the layered model, the shipped workflows and schemas, and the convention for adding new workflows.
- **README v2.0.0 runtime callout** near Installation: notes that v2.0.0 requires Claude Code with the Workflow tool, and points users on older Claude Code installs to `npm install --save-dev @houseofwolvesllc/claude-scrum-skill@1.8.1` as a fallback.
- **`/project-orchestrate` Before You Start item 0**: Workflow-tool availability check with explicit abort + v1.8.x fallback guidance.
- **`/project-emulate` Phase 5.5**: Adversarial Verification of Findings (invokes `adversarial_verify.js`).
- **`/project-cleanup` Phase 5.5**: Multi-Lens Review Panel (invokes `review_panel.js`).
- **`/project-spec` schema-validated sibling output**: in addition to the markdown spec, writes a sibling `<timestamp>_<name>.spec.json` conforming to `SpecSchema`.
- **ADR-0003** at `docs/adrs/0003-workflow-backed-re-plumbing.md` documenting the architectural shift, alternatives considered, and consequences.
- **`package.json` `files` field** includes `lib/` so workflows ship in the published tarball.

### Changed
- **`/project-orchestrate` Phase 1 Step 3 (Story Execution)** rewritten to invoke `sprint_pipeline.js`. Concurrency lifts from 3 to 16; per-stage barriers removed. Pre-spawn checks (independence, persona resolution, human/cowork skip) and post-workflow persistence are documented inline. Replaces ~80 lines of Task-spawning subagent-prompt prose.
- **`/project-orchestrate` Sequential Multi-Path Mode Per-Spec Loop** rewritten to invoke `multi_spec_queue.js`. The queue's `--skip-on-pause` handling lives in the workflow.
- **`/project-scaffold` Two-Pass Procedure Pass 2** rewritten to invoke `elaborate_epics.js`. Pass 1 narration (single-agent skeleton extraction) unchanged.

### Removed
- **Task-spawning narrative prose** in `/project-orchestrate` Phase 1 Step 3 (the verbose subagent-prompt-structure block, the persona-routing bash snippets, the concurrency-3 cap text). Replaced by a thin Workflow-invocation directive.
- **Multi-spec queue hand-coded loop prose** in `/project-orchestrate` Sequential Multi-Path Mode Per-Spec Loop. Replaced by a workflow invocation.
- **Pass 2 fan-out narrative prose** in `/project-scaffold` Two-Pass Procedure. Replaced by a workflow invocation.

### Migration

**Users:** zero migration effort. Same slash commands. Same prompts. Same artifact files (state files, ADRs, CONTEXT.md, queue state file). Same backend-mode semantics (local / GitHub / Jira / Trello). The user-facing surface is byte-for-byte unchanged.

**Runtime requirement:** v2.0.0 requires a Claude Code version that exposes the **Workflow tool**. Modern Claude Code (latest CLI auto-updated, desktop app, web app, IDE extensions) all include it. If your CLI is months out of date and not auto-updating, run `npm update -g @anthropic-ai/claude-code` before upgrading. Users who cannot or do not want to update Claude Code should pin to the fallback:

```bash
npm install --save-dev @houseofwolvesllc/claude-scrum-skill@1.8.1
```

**Plugin / extension authors** who hooked into the v1.x verbose Task-spawning prose sections in `/project-orchestrate` Phase 1 Step 3, `/project-scaffold` Pass 2, or the multi-spec queue per-spec loop will need to update — those sections are now thin Workflow-invocation directives. Hook into the workflow scripts directly (`lib/workflows/<name>.js`) if extending behavior, or invoke the underlying agents through the Workflow tool.

**State file backward compatibility:** v2.0.0 reads existing `orchestration-state.md`, `orchestration-state-<slug>.previous.md`, and `orchestration-queue-state.md` files in their v1.8.x markdown format. Mid-run upgrades (start on v1.8.1, finish on v2.0.0) work — the state files are interchangeable.

## [1.8.1] — 2026-05-28

### Changed
- README install instructions now recommend `npm install --save-dev` (or `-D`) for local installs. The previous wording implicitly saved to `dependencies`, which shipped the package to production installs, ran the postinstall in environments where `~/.claude/skills/` doesn't exist, bloated Docker layers and audit output, and semantically misrepresented the package — it's developer tooling (Claude Code at planning/build/iteration time), peer to `eslint`/`prettier`/`vitest`. Includes an explanatory callout under the install snippet. Patch release to refresh the README shown on npmjs.com — npm's package page is updated from the README in the published tarball, so a publish is required for the corrected install instructions to reach npm consumers.

## [1.8.0] — 2026-05-28

### Added
- **Sequential multi-path mode in `project-orchestrate`.** When invoked with 2+ existing-file PRD paths (e.g., `/project-orchestrate spec-1.md spec-2.md spec-3.md`), each spec receives its own complete orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) end-to-end before the next begins. Each spec keeps its own design-spike (if triggered), emulation, cleanup, and ADR — no cross-spec contamination. New default for multi-path invocation; replaces v1.7.x's undefined agent-improvised merge behavior.
- **`depends_on` PRD document frontmatter** for declaring inter-spec execution-order constraints. Topological sort with stable tie-break on argument order. Cycles (including self-loops) and missing dependencies abort the run before any spec starts, with explicit error messages naming the cycle members or the missing entry.
- **`--skip-on-pause` flag** (default off): in multi-path mode, a spec whose orchestration pauses on a safety gate is marked `skipped`, its state file archived with `.skipped.md` suffix, and the queue advances to the next spec. Without the flag, the queue pauses and waits for resolution.
- **`--merged` flag** (default off): opt-in for the pre-1.8.0 best-effort unified-multi-spec behavior. Emits a deprecation-style warning that formal merged semantics are deferred to a follow-up spec.
- **Queue state file** at `.claude-scrum-skill/orchestration-queue-state.md` tracking the multi-path run: resolved execution order, per-spec status (pending / in-progress / completed / paused / skipped), aggregate stats, append-only log. Resumable on safety-gate pause; archived to `.previous.md` on clean completion.
- **Slug-suffixed per-spec state archives** in multi-path mode: `orchestration-state-<spec-slug>.previous.md` on completion, `orchestration-state-<spec-slug>.skipped.md` on `--skip-on-pause` pause. Slug derived from `basename(path, ".md")`; slug collisions abort before run.
- **Cumulative summary** at end of multi-path run: per-spec sections plus aggregate header (specs in queue, completed/paused/skipped counts, total stories, sprints, ADRs, duration).
- New CONVENTIONS.md section "PRD Document Frontmatter" documenting the `depends_on` field.
- README "Invocation Patterns" table and "Multi-Path Flags" / "Inter-Spec Dependencies" subsections under Autonomous Orchestration.

### Changed
- `project-orchestrate` Input section gains item 5 documenting multi-path invocation; new top-level "Input Parsing and Mode Detection" section formalizes the seven-case classification table (5 valid modes + 1 mixed-arg error + glob expansion fallback) and the flag parsing rules.
- `project-orchestrate` Phase 3 Step 17 (state file cleanup) now suppressed in multi-path mode — the wrapper handles archival with the slug-suffixed naming instead. Single-spec mode lifecycle is unchanged from v1.7.1.
- Backward compatibility: single-path (`/project-orchestrate spec.md`), repo-identifier (`/project-orchestrate owner/repo`), single-path + repo-identifier, and no-arg (`/project-orchestrate`) invocations are all unchanged from v1.7.1.

## [1.7.1] — 2026-05-27

### Changed
- `project-orchestrate` "Default Operating Mode" section rewritten in terse imperative voice. The 1.7.0 version was verbose policy text (~50 lines, enumerated allowed pauses, multiple subsections) that didn't reliably override a cautious agent's pre-flight audit instinct. The 1.7.1 version is ~15 lines, command-voice throughout, and explicitly forbids the "list concerns then ask which option" anti-pattern observed in practice. Functional behavior unchanged — same mandatory phases, same four safety gates, same state-file automation.

## [1.7.0] — 2026-05-27

### Added
- Two-pass scaffolding mode in `project-scaffold` — when triggered, splits PRD parsing across one skeleton-extraction agent (Pass 1) and one elaboration subagent per epic (Pass 2, max 3 concurrent). Keeps per-epic context tight on large PRDs so the last epic's stories are as well-specified as the first. Triggers in precedence order: CLI flag → PRD frontmatter (`scaffold_mode`) → word-count threshold (`scaffold.two_pass_threshold_words`, default 5000). Auto-downgrades to single-pass elaboration when Pass 1 yields ≤ 2 epics; degrades gracefully on Pass 1 / Pass 2 failure.
- Design-spike epic auto-injection in `project-scaffold` — prepends a research-driven pre-epic at position 0 when triggered. Stories produce one foundational ADR + one CONTEXT.md per implementation epic. Implementation epics are gated via the existing `blocked_by` mechanism; sprint planning naturally waits for the design-spike epic to complete before selecting implementation stories.
- CONTEXT.md template at `skills/shared/templates/CONTEXT-template.md` with seven required sections (Overview, Naming Conventions, File Layout, Shared Types & Interfaces, Patterns to Follow, Patterns to Avoid, External References).
- ADR template at `skills/shared/templates/ADR-template.md` following the Michael Nygard format.
- Config keys: `scaffold.two_pass_threshold_words` (default 5000), `scaffold.design_spike_enabled` (default true), `paths.context` (default `.claude-scrum-skill/context`).
- PRD frontmatter controls: `scaffold_mode: single-pass | two-pass`, `design_spike: true | false`. CLI flag equivalents (`--mode`, `--design-spike` / `--no-design-spike`) documented.
- Verification fixtures at `docs/specs/_fixtures/` (small PRD, large PRD, README with 9-case verification matrix from the source spec's Testing Strategy).
- `type:design-spike` label and `epic_type: design-spike` frontmatter field for canonical design-spike epic detection across all four backends (local, GitHub, Jira, Trello).
- ADR-0001 documenting the architectural decisions behind two-pass scaffolding and the design-spike epic.

### Changed
- `project-orchestrate` defaults to **fully autonomous execution**. A new "Default Operating Mode" section at the top of the skill mandates: no routine confirmation prompts, no skipping of Phase 2 (Emulation) or Phase 3 (Cleanup), and automatic state-file handling on resume/restart (paused-state files resume without prompting; completed-state files are archived as `orchestration-state.previous.md` and a fresh run starts). Only the four safety gates pause the run — unresolvable merge conflict, critical review finding, 3rd dirty hardening run, rate-limit exhaustion. The State Management section's startup decision tree is simplified accordingly, and Phase 2 / Phase 3 are explicitly marked **mandatory** to prevent skip-when-clean drift. Per-invocation interactive overrides remain honored when the user explicitly asks for them.
- `project-orchestrate` Step 3 subagent prompt instructs subagents to read the epic's `CONTEXT.md` (when present) in addition to `CLAUDE.md` before writing code; CONTEXT.md sections override generic CLAUDE.md conventions for that epic.
- `project-orchestrate` Step 16 ADR creation now explicitly shares a single sequential numbering pool with design-spike ADRs and hand-authored ADRs (next number = `max(existing) + 1`).
- `project-orchestrate` Step 2 sprint planning explicitly affirms the `blocked_by` gate so implementation stories naturally wait for their design-spike blockers to complete.
- `CONVENTIONS.md` documents the `type:design-spike` label, the `epic_type: design-spike` frontmatter field (local mode), and the design-spike epic workflow under Epic Structure.
- `README.md` documents the new Two-Pass Mode and Design-Spike Epic features, the new config keys, the PRD frontmatter overrides, and updates the Autonomous Orchestration Phase 1 flow to thread the design-spike epic.
- Single-pass behavior preserved — small PRDs (single epic, < 5000 words, no frontmatter overrides) continue through the original path unchanged. Backward compatible.

## [1.1.0] — 2026-02-16

### Changed
- Three-tier branch model: story → release → development → main (adds development as sprint approval gate)
- Expanded `project-emulate` walkthrough lifecycle with detailed sub-steps per stage
- Improved `sprint-plan` with structured proposed sprint output table
- Enhanced `sprint-release` with detailed PR body template, milestone closing, and error handling
- Added release branch health and actionable recommendations to `sprint-status`
- Simplified board views in `CONVENTIONS.md` (6 → 5 views)
- Added `rolled-over` status signal label to `CONVENTIONS.md`
- Updated README branch strategy to reflect three-tier model

### Removed
- Removed `allowed-tools` and `argument-hint` from skill frontmatter

## [1.0.0] — 2026-02-16

### Added
- `project-scaffold` — Scaffold GitHub Projects from PRD documents
- `sprint-plan` — Plan and populate sprint iterations
- `sprint-status` — Generate sprint progress reports
- `sprint-release` — Close sprints and open release PRs
- `project-emulate` — Full walkthrough coverage testing across all roles and lifecycle stages
- Shared `CONVENTIONS.md` for consistent project management standards
- npm package with auto-install to `~/.claude/skills/`
- Claude Code plugin marketplace support via `marketplace.json`
