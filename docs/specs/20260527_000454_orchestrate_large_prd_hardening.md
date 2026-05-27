# Orchestrate — Large PRD Hardening Specification

## Overview

`/project-orchestrate` produces uneven results when invoked against large PRDs (30+ pages, multiple epics, dozens of stories). Two structural problems cause this:

1. `/project-scaffold` reads the entire PRD into a single agent context and produces every epic and every story in one pass. On large inputs, decomposition quality decays across the document — the first epic gets rich, well-bounded stories, the last epic gets terse stub stories that force the implementing subagent to invent scope at execution time.
2. Implementation subagents executing stories from the same epic in parallel have no shared design anchor beyond the project's `CLAUDE.md`. The architectural intent that ties an epic's stories together lives only in the PRD, which the subagents never see. Parallel subagents independently invent naming, file layout, and patterns for shared concerns — surfaced only at the sprint-level review gate, after drift has compounded.

This spec resolves both problems with two coordinated changes:

- **Two-pass scaffolding** splits the PRD parsing work across multiple focused subagents so per-epic context stays tight, regardless of PRD size.
- **Design-spike epic** automatically scaffolds a research-driven pre-epic that produces an Architecture Decision Record (ADR) and per-epic `CONTEXT.md` files, giving every subsequent implementation subagent a shared anchor for naming, file layout, types, and patterns.

The changes are independent — each can ship without the other — but they compound. Two-pass scaffolding raises the floor on story decomposition quality; design-spike epic raises the ceiling on cross-story consistency.

## Objectives

### Primary Objectives

- Decompose large PRDs evenly across all epics, so the last epic's stories are as well-specified as the first epic's stories.
- Establish a shared, durable design anchor per epic that survives across parallel subagent invocations and across sprint boundaries.
- Add zero overhead to small PRDs — single-epic, sub-5000-word PRDs continue through the existing single-pass path unchanged.

### Secondary Objectives

- Make the trigger thresholds configurable, with sensible defaults and an explicit PRD-author override.
- Preserve full backward compatibility for in-flight orchestration runs that started before this change.
- Keep the design-spike output format consistent across all four scaffolding backends (local, GitHub, Jira, Trello) by anchoring artifacts to the git filesystem rather than per-backend storage.

## Requirements

### Functional Requirements

**Two-Pass Scaffolding**

- FR-1. `/project-scaffold` MUST switch from single-pass to two-pass mode when any of the following are true:
  - PRD word count exceeds the configurable threshold (default 5000 words), OR
  - PRD frontmatter contains `scaffold_mode: two-pass`, OR
  - User explicitly passes `--mode two-pass` on the skill invocation.
- FR-2. `scaffold_mode: single-pass` in PRD frontmatter MUST force single-pass mode regardless of word count.
- FR-3. In two-pass mode, Pass 1 MUST produce a structured skeleton manifest containing for each identified epic: name, slug, one-paragraph description, source PRD line range (start_line, end_line), inter-epic dependencies, and an optional "shared design concerns" list (naming, file layout, types, patterns the epic introduces that other epics may consume).
- FR-4. Pass 1 MUST additionally extract a "global preamble" — project overview, glossary, cross-cutting non-functional requirements — passed to every Pass 2 subagent as shared context.
- FR-5. After Pass 1 completes, if epic count is ≤ 2, scaffolding MUST auto-downgrade to single-pass elaboration (one subagent handles all epics) to avoid overhead when two-pass yields no benefit.
- FR-6. Pass 2 MUST spawn one subagent per epic. Each Pass 2 subagent receives only its assigned epic's PRD slice, the global preamble, and the skeleton summary of sibling epics (for dependency awareness). It produces the full story list with acceptance criteria, technical context, story points, executor assignments, persona labels, and dependency declarations for its epic only.
- FR-7. Pass 2 subagent concurrency MUST be capped at 3 in parallel (matches `/project-orchestrate` Step 3 convention).
- FR-8. After all Pass 2 subagents complete, the orchestrator MUST assemble stories into a single backlog and create issues/files via the existing backend creation logic. Slug collisions across epics MUST be detected and resolved by prepending the epic slug to the colliding story slug.

**Design-Spike Epic**

- FR-9. A design-spike epic MUST be automatically scaffolded when any of the following are true:
  - Two-pass mode was triggered AND the scaffold produces > 1 implementation epic, OR
  - PRD frontmatter contains `design_spike: true`, OR
  - User explicitly passes `--design-spike` on the skill invocation.
- FR-10. `design_spike: false` in PRD frontmatter MUST suppress the design-spike epic even when other triggers fire.
- FR-11. The design-spike epic MUST be created at position 0 (first epic). Its default title is "Architecture & Design" but the title is not load-bearing — detection uses a label/field, not a name match.
- FR-12. The design-spike epic MUST be labeled `type:design-spike` (GitHub/Trello), have `epic_type: design-spike` in `_epic.md` frontmatter (local), or have the equivalent Jira label.
- FR-13. The design-spike epic MUST contain:
  - One ADR-authoring story (`persona: research`, executor `claude`) producing the project's foundational ADR at `<paths.adr>/NNNN-<slug>.md`.
  - One CONTEXT.md-authoring story per implementation epic (`persona: research`, executor `claude`) producing `<paths.context>/<epic-slug>/CONTEXT.md`.
- FR-14. All implementation epics MUST be declared as `blocked_by` the design-spike epic's stories via the existing dependency mechanism. Sprint planning MUST NOT select any implementation story until the design-spike epic is `done`.
- FR-15. Every implementation story's Technical Context section MUST receive an auto-injected reference: `See [.claude-scrum-skill/context/<epic-slug>/CONTEXT.md] and [<paths.adr>/NNNN-<slug>.md] for shared architectural decisions.`

**Subagent Prompt Updates**

- FR-16. `/project-orchestrate` Step 3 subagent prompt template MUST be updated to include the instruction: "Before writing any code, if `<paths.context>/<epic-slug>/CONTEXT.md` exists, read it in full. Treat its naming, file layout, types, and patterns sections as binding for this epic — they override generic conventions in CLAUDE.md when in conflict, and you should follow them even when CLAUDE.md is silent."
- FR-17. `/project-orchestrate` Step 16 (ADR Update) MUST continue numbering ADRs from the last existing ADR number in `<paths.adr>`, regardless of whether prior ADRs were created during the design-spike epic or in prior runs.

**Configuration**

- FR-18. New config keys MUST be added to `shared/config.json` with documented defaults:
  - `scaffold.two_pass_threshold_words` (default `5000`)
  - `scaffold.design_spike_enabled` (default `true`)
  - `paths.context` (default `.claude-scrum-skill/context`)
- FR-19. Missing config keys MUST fall back to defaults silently — existing `config.json` files without these keys MUST continue to work.

### Non-Functional Requirements

- NFR-1. **Backward compatibility.** Existing PRDs without frontmatter and existing `config.json` files MUST continue to work without modification. A small PRD (single epic, < 5000 words) MUST follow the existing single-pass path exactly as before.
- NFR-2. **State-file safety.** If an `/project-orchestrate` state file exists with `Status: running` or `Status: paused`, resumption MUST NOT retroactively inject a design-spike epic or alter scaffolding decisions. New behaviors only apply to fresh `/project-scaffold` invocations.
- NFR-3. **Failure resilience.** Pass 1 failures MUST retry once with the same input; on second failure, the orchestrator MUST log the failure and fall back to single-pass scaffolding rather than aborting. Pass 2 subagent failures MUST retry once with the failure context appended; on second failure, that epic's stories MUST be left in `status: needs-context` with a note, and the user MUST be notified, but sibling Pass 2 subagents MUST continue.
- NFR-4. **Performance.** Two-pass mode MUST NOT increase wall-clock scaffolding time by more than 50% versus single-pass for a comparable input. Parallel Pass 2 subagents amortize the additional Pass 1 overhead.
- NFR-5. **Idempotency.** Re-running `/project-scaffold` on the same PRD with an existing project MUST NOT create duplicate design-spike epics. The skill MUST detect an existing epic with the `type:design-spike` label/field and skip recreation.
- NFR-6. **Cross-backend parity.** The design-spike ADR and CONTEXT.md artifacts MUST be committed to the `development` branch via filesystem in all four scaffolding modes. Remote backends (GitHub/Jira/Trello) MAY additionally surface links to these files via milestone/epic descriptions, but the filesystem-committed files are the single source of truth.

## Technical Specifications

- **Language/Framework**: Markdown-based skill definitions (no executable code beyond `bash` snippets within `SKILL.md` files). Configuration in JSON.
- **Dependencies**: No new external dependencies. Uses existing `gh` CLI (GitHub mode), `curl` (Jira/Trello modes), and filesystem operations (local mode).
- **Key Components**:
  - `skills/project-scaffold/SKILL.md` — primary modification target. Adds two new sections (Two-Pass Mode, Design-Spike Epic) and updates each backend procedure to integrate them.
  - `skills/project-orchestrate/SKILL.md` — updates subagent prompt template in Step 3 and adds gating logic to Step 2 sprint planning.
  - `skills/shared/config.json` — new keys with defaults.
  - `skills/shared/references/CONVENTIONS.md` — documents the new `type:design-spike` label, `epic_type` frontmatter field, `paths.context` path convention, and the design-spike workflow.
  - `skills/shared/templates/CONTEXT-template.md` — new file defining the CONTEXT.md required structure.
  - `skills/shared/templates/ADR-template.md` — new file (if not already present) defining ADR structure for design-spike output.
- **Data Structures**:
  - **Pass 1 skeleton manifest** (intermediate, in-context only — not persisted):
    ```yaml
    project:
      name: <string>
      description: <string>
      global_preamble: <multi-line markdown excerpt>
      non_functional_requirements: [<string>]
    epics:
      - name: <string>
        slug: <kebab-case string>
        description: <one-paragraph string>
        slice:
          start_line: <int>
          end_line: <int>
        depends_on: [<epic-slug>]
        shared_design_concerns:
          - <string describing naming/layout/type/pattern this epic introduces>
    ```
  - **CONTEXT.md required sections** (template):
    ```markdown
    # <Epic Name> — Shared Context

    ## Overview
    <1-2 sentence summary of what this epic builds and how its stories fit together>

    ## Naming Conventions
    <Domain terms, prefixes, suffixes specific to this epic.
    Example: "All endpoint handlers prefix with `handle_`. All event names use past tense (`EntryCreated`, not `CreateEntry`)."

    ## File Layout
    <Where new files for this epic's stories live.
    Example: "Repository implementations under `src/data/<entity>/`. Controllers under `src/api/<entity>/`. Types under `src/core/<entity>/types.ts`.">

    ## Shared Types & Interfaces
    <Code blocks with type definitions stories must consume rather than redefine.>

    ## Patterns to Follow
    <Code-level patterns with examples. Error handling, logging, pagination, etc.>

    ## Patterns to Avoid
    <Anti-patterns specific to this epic with rationale.>

    ## External References
    - ADR: <path to ADR>
    - CLAUDE.md sections: <bullet list>
    - Upstream docs: <links if any>
    ```
- **APIs/Interfaces**: No new external APIs. New internal "interfaces" are the manifest shape between Pass 1 and Pass 2, and the CONTEXT.md template shape between research subagents and implementation subagents.

## User Experience

### Trigger Visibility

When `/project-scaffold` decides to enter two-pass mode or scaffold a design-spike epic, it MUST announce the decision and reasoning before doing the work:

```
PRD analysis:
  Word count: 8,420 (threshold: 5000) → triggering two-pass mode
  Frontmatter design_spike: not set → defaulting to true (multi-epic + two-pass)

Proceeding with two-pass scaffolding + design-spike epic.

Pass 1: extracting epic skeleton... done. 4 epics identified.
  - Architecture & Design (design-spike, 5 stories)
  - Auth (12 stories estimated)
  - Dashboard (8 stories estimated)
  - Notifications (6 stories estimated)

Pass 2: spawning 4 elaboration subagents (max 3 concurrent)...
```

### Author Override

A PRD author can preempt the auto-detected behavior via frontmatter:

```yaml
---
title: My Project
scaffold_mode: two-pass     # force two-pass even for small PRD
design_spike: false         # suppress design-spike even when triggered
---
```

The skill MUST report the override explicitly in its trigger announcement so the user understands why the heuristic was bypassed.

### Failure Handling

Pass 1 retry, Pass 2 retry-then-mark-needs-context, and auto-downgrade all MUST be surfaced clearly in the skill output, not silently. The user must understand whether their scaffold completed cleanly or with degraded sections.

## Architecture

### Component Diagram

```
                  PRD document
                       │
                       ▼
        ┌──────────────────────────────┐
        │   /project-scaffold (entry)  │
        │                              │
        │  - Read config               │
        │  - Detect backend            │
        │  - Evaluate triggers         │
        │     ├─ word count            │
        │     ├─ frontmatter overrides │
        │     └─ CLI flags             │
        └──────────────┬───────────────┘
                       │
            ┌──────────┴──────────┐
            │                     │
       single-pass            two-pass
            │                     │
            ▼                     ▼
   ┌──────────────┐     ┌──────────────────┐
   │  Single      │     │   Pass 1         │
   │  elaboration │     │  (skeleton)      │
   │  subagent    │     │                  │
   │              │     │  Emits manifest  │
   │              │     │  + global        │
   │              │     │  preamble        │
   └──────┬───────┘     └────────┬─────────┘
          │                      │
          │            ┌─────────┴──────────┐
          │            │  design-spike?     │
          │            │  inject pre-epic   │
          │            └─────────┬──────────┘
          │                      │
          │                      ▼
          │            ┌──────────────────┐
          │            │   Pass 2         │
          │            │  (per-epic, max  │
          │            │  3 concurrent)   │
          │            └────────┬─────────┘
          │                     │
          └─────────┬───────────┘
                    ▼
       ┌─────────────────────────────┐
       │  Story assembly             │
       │  - Dedupe slugs             │
       │  - Inject CONTEXT.md refs   │
       │  - Wire dependencies        │
       │  (design-spike → impl epics)│
       └────────────┬────────────────┘
                    │
                    ▼
       ┌─────────────────────────────┐
       │  Backend creation           │
       │  (existing per-mode logic)  │
       └─────────────────────────────┘
```

### Data Flow

1. PRD enters `/project-scaffold`.
2. Config + frontmatter + CLI flags are evaluated; triggers determine mode.
3. **Two-pass branch:** Pass 1 subagent produces the skeleton manifest; manifest is held in orchestrator context (not persisted to disk).
4. **Design-spike branch:** If triggered, orchestrator augments the skeleton by injecting a position-0 design-spike epic with generated research stories (one ADR story + N CONTEXT.md stories) and adding `blocked_by` references on each implementation epic's stories.
5. Pass 2 subagents (up to 3 concurrent) each produce stories for their assigned epic. The design-spike epic's Pass 2 produces research-persona stories whose acceptance criteria are "produce the ADR/CONTEXT.md at the specified path with the required sections."
6. Orchestrator assembles all stories, deduplicates slugs, and auto-injects the CONTEXT.md/ADR Technical Context reference into every implementation story.
7. Backend creation runs unchanged — issues, files, branches, labels.
8. Later, when `/project-orchestrate` executes stories, the design-spike stories run first (gated by the dependency mechanism), producing the actual ADR and CONTEXT.md files on the `development` branch. Subsequent implementation subagents read these files (per the updated Step 3 prompt) before writing code.

### System Boundaries

- This change is contained within `skills/project-scaffold/` and `skills/project-orchestrate/`, plus `skills/shared/`.
- No changes to `sprint-plan`, `sprint-status`, `sprint-release`, `project-cleanup`, `project-emulate`, or `project-spec`.
- The dependency graph wiring (design-spike stories blocking implementation stories) reuses the existing `blocked_by` / `blocks` mechanism — no new dependency primitive.

### Integration Points

- **`/sprint-plan`** — no code change required, but the design-spike epic's stories will naturally appear in early sprints due to existing dependency-aware selection. Verify that the first sprint after scaffolding selects design-spike stories and excludes blocked implementation stories.
- **`/project-orchestrate` Step 2** — must check that the design-spike epic is `closed` before allowing implementation epics into a sprint. If the dependency mechanism already enforces this via story-level `blocked_by`, no change is needed; otherwise add explicit gate.
- **`/project-orchestrate` Step 3 subagent prompt** — append the CONTEXT.md read instruction (FR-16).
- **`/project-orchestrate` Step 16** — read existing ADRs to find the next sequential number, accounting for ADRs created during the design-spike epic.

## Implementation Plan

### Phase 1 — Foundation

1. Add new config keys to `skills/shared/config.json` and document them inline. Verify defaults work when keys are missing.
2. Create `skills/shared/templates/CONTEXT-template.md` with the required sections defined in the Technical Specifications above.
3. Create `skills/shared/templates/ADR-template.md` if it does not already exist (check `skills/shared/templates/` first).
4. Update `skills/shared/references/CONVENTIONS.md`:
   - Add `type:design-spike` to the Type Labels section.
   - Document the `epic_type` frontmatter field (local mode).
   - Document `paths.context` and the CONTEXT.md location convention.
   - Add a "Design-Spike Epic" subsection under Epic Structure describing when it appears, what it contains, and how it gates implementation epics.

### Phase 2 — Two-Pass Scaffolding

5. Insert a new "Mode Detection" step into `skills/project-scaffold/SKILL.md`, positioned between "Before You Start" and the per-backend procedures. This step evaluates triggers and announces the decision.
6. Insert a new "Two-Pass Procedure" section into `skills/project-scaffold/SKILL.md` that runs when two-pass mode is triggered, regardless of backend. The section describes Pass 1, the manifest shape, Pass 2 spawning rules, concurrency cap, and the assembly step.
7. Update each per-backend procedure (Local, GitHub, Jira, Trello) to call into the two-pass procedure when triggered, and otherwise follow the existing single-pass flow. The backend-specific creation logic (Step 4+ in current GitHub flow, Step 3+ in local flow) is reused unchanged after Pass 2 completes.
8. Add slug deduplication logic to the story assembly step: detect collisions across Pass 2 outputs, prepend epic slug to the second occurrence, log the rename.
9. Add Pass 1 retry + fallback-to-single-pass logic.
10. Add Pass 2 retry + needs-context fallback logic.

### Phase 3 — Design-Spike Epic

11. Insert a new "Design-Spike Epic" section into `skills/project-scaffold/SKILL.md`, called from the assembly step when triggered.
12. Implement the skeleton augmentation: inject the design-spike epic at position 0, generate its research stories (one ADR story + one CONTEXT.md story per implementation epic), and add `blocked_by` references on each implementation epic's stories.
13. Implement the auto-injection of the Technical Context reference (`See <epic-slug>/CONTEXT.md and ADR-NNN ...`) into every implementation story.
14. Add idempotency check: if scaffolding into an existing project, detect existing `type:design-spike` epic and skip injection.

### Phase 4 — Orchestrate Integration

15. Update `skills/project-orchestrate/SKILL.md` Step 3 subagent prompt template with the CONTEXT.md read instruction (FR-16).
16. Update `skills/project-orchestrate/SKILL.md` Step 16 to compute the next ADR number from existing ADRs in `<paths.adr>`, so design-spike ADRs and retrospective ADRs share a single sequential pool.
17. Verify (by reading the existing logic) that Step 2 sprint planning honors `blocked_by` and naturally gates implementation work until the design-spike epic completes. If not, add an explicit gate.

### Phase 5 — Documentation & Verification

18. Update each affected `SKILL.md` to document the new flags, frontmatter fields, and behavior in their respective "Before You Start" and "Input" sections.
19. Update the project `README.md` to reflect the new behavior. README updates are a **required deliverable**, not optional — the README is the primary user-facing surface for these features. Apply the following updates:
    - **Scaffolding Modes section:** Add a "Two-Pass Mode" subsection documenting the trigger heuristics (word count threshold, `scaffold_mode` frontmatter, CLI flag), the override semantics (`single-pass` vs `two-pass`), and what the user sees in the skill output (trigger announcement, Pass 1/Pass 2 progress, auto-downgrade behavior).
    - **Scaffolding Modes section:** Add a "Design-Spike Epic" subsection documenting what auto-injects, what the design-spike produces (ADR at `<paths.adr>/` + per-epic `CONTEXT.md` at `<paths.context>/<epic-slug>/`), how to suppress it via `design_spike: false`, how implementation subagents consume the artifacts, and the gating relationship (implementation epics blocked until design-spike completes).
    - **Write a PRD walkthrough:** Add a PRD frontmatter example showing the new `scaffold_mode` and `design_spike` overrides alongside the existing PRD authoring guidance, so authors discover the controls at the point of PRD authoring.
    - **Configuration table:** Add rows for the new config keys with defaults — `scaffold.two_pass_threshold_words` (5000), `scaffold.design_spike_enabled` (true), and `paths.context` (`.claude-scrum-skill/context`).
    - **Autonomous Orchestration section:** Update the `/project-orchestrate` flow description to note that on triggered runs the design-spike epic executes first and produces ADRs + CONTEXT.md files that seed the implementation epics. Update the "Phase 1" flow summary to show design-spike as the leading epic.
    - **Skills table:** No row changes required, but verify each skill description still accurately reflects its behavior after these changes; tighten wording if any description has become misleading.
    - **Best Practices / Tips section** (if present): Add a tip noting that authors of large PRDs benefit from including explicit architectural intent the design-spike epic can lift into the ADR (e.g., "shared types", "naming conventions", "file layout boundaries"), since the design-spike subagent works from PRD content.
20. Manually verify against a synthetic large PRD (constructed for the purpose of this verification — see Testing Strategy).

## Testing Strategy

Skills in this repo are markdown documents, not executable code, so testing is primarily verification-by-execution against known-shape inputs rather than unit testing.

### Verification Inputs

Construct two synthetic PRDs under `docs/specs/_fixtures/`:

- `small_prd.md` — single epic, ~2000 words. Verifies that the single-pass path is unchanged and no design-spike epic is auto-injected.
- `large_prd.md` — 3+ epics, ~8000 words, with explicit cross-cutting concerns (shared types, naming, file layout). Verifies that two-pass mode triggers, design-spike epic is created, CONTEXT.md files are produced with the right shape, and implementation subagents reference them correctly.

### Verification Cases

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Small PRD, no overrides | `small_prd.md` | Single-pass; no design-spike; existing behavior preserved. |
| Large PRD, no overrides | `large_prd.md` | Two-pass; design-spike auto-injected; ADR + CONTEXT.md per epic generated when stories execute. |
| Small PRD, `scaffold_mode: two-pass` | `small_prd.md` + frontmatter override | Two-pass forced; design-spike NOT injected (single epic ≤ 1 implementation epic). |
| Large PRD, `design_spike: false` | `large_prd.md` + frontmatter override | Two-pass; no design-spike; implementation stories have NO auto-injected CONTEXT.md reference. |
| Re-scaffold existing project | `large_prd.md` against existing scaffold with design-spike epic already present | Skip design-spike creation; new stories added to existing epics without duplicate ADR/CONTEXT.md scaffolding. |
| Pass 1 failure (simulated) | `large_prd.md` with deliberately malformed structure | Retry once, then fall back to single-pass with warning. |
| Slug collision across Pass 2 subagents | crafted `large_prd.md` with similar story names across epics | Detect collision, prepend epic slug to second occurrence, log rename, continue. |
| State-file resume | Existing `.claude-scrum-skill/orchestration-state.md` with `Status: running` | `/project-orchestrate` resumes without re-scaffolding; no design-spike retroactively injected. |
| Backend parity | `large_prd.md` against each of local/GitHub/Jira/Trello modes | CONTEXT.md and ADR files end up at the same filesystem paths in all four modes; remote modes additionally surface links in milestone/epic descriptions. |

### Behavioral Verification (post-implementation)

After scaffolding a large PRD with design-spike enabled, run `/project-orchestrate` end-to-end and check:

1. The design-spike epic's stories execute first and produce the expected ADR + CONTEXT.md files on `development`.
2. Implementation subagents in subsequent sprints reference the CONTEXT.md (verifiable by reading their PR descriptions, which the `impl` persona requires).
3. The sprint-level `review` persona reports fewer cross-story inconsistencies than a baseline run without design-spike (subjective but observable in the review summary's "Critical/Warning" counts).
4. Step 16 ADR creation does not collide with the design-spike ADR number.

## Future Considerations

### Potential Extensions

- **Per-story review gate.** The conversation that produced this spec identified a complementary improvement: lightweight automated review on each story PR before merging to the release branch, not only on the release PR. Deferred to a separate spec to keep this change focused. The hooks in `/project-orchestrate` Step 3 (after each subagent completes) are the natural insertion point.
- **CONTEXT.md cross-epic resolution.** When two epics share a concern (e.g., both produce API endpoints), they currently get independent CONTEXT.md files. A future enhancement could detect overlap and produce a shared `_global/CONTEXT.md` referenced by both epics' files.
- **Pass 1 skeleton review.** For very large PRDs, a human review of the Pass 1 skeleton (before Pass 2 spawns) could catch mis-decomposed epic boundaries early. This would be a `--review-skeleton` flag on `/project-scaffold`.
- **Story-level design spike.** Currently the design-spike is an epic. For individual stories whose acceptance criteria are research-shaped, the existing `persona: research` mechanism already handles this and is unchanged.
- **Adaptive thresholds.** The 5000-word threshold is a starting point. With usage data, the threshold could be tuned per project via `config.json`, or even auto-tuned based on observed story-quality outcomes from prior runs.

### Scalability Considerations

- **Very large PRDs (>20k words).** Pass 1 may itself approach context limits. A future enhancement could chunk Pass 1 across a hierarchical extractor — first extract section structure, then extract epics from each section — but this is YAGNI until a real PRD hits the limit.
- **Many epics (>10).** Pass 2 concurrency cap of 3 means a 10-epic PRD takes ~4 rounds of subagent execution. This is acceptable for scaffolding (a one-time setup activity) but could be made configurable if needed.
- **CONTEXT.md drift over time.** As implementation evolves, CONTEXT.md may diverge from reality. The `project-cleanup` skill or a future "context-refresh" skill could re-derive CONTEXT.md from the actual codebase at sprint boundaries. Out of scope here.

### Long-term Maintenance Notes

- The two-pass mode and design-spike features are additive. If they prove problematic, they can be disabled wholesale via `scaffold.two_pass_threshold_words: 999999` and `scaffold.design_spike_enabled: false` in `config.json`, reverting all projects to existing behavior.
- The CONTEXT.md template lives in `skills/shared/templates/` and can be revised without touching scaffold or orchestrate skill code. Subagent prompts reference the file structure but not its exact wording, so template revisions cascade automatically.
- The `type:design-spike` label and `epic_type: design-spike` frontmatter field are the canonical detection signals — never rename the label or field without updating both `/project-scaffold` and `/project-orchestrate` in the same commit.
- The Pass 1 manifest shape is an internal contract between scaffold's Pass 1 and Pass 2 stages. It is not persisted to disk and not exposed externally, so the shape can evolve freely as long as both sides update together.
