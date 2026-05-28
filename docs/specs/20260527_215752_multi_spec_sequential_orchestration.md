# Multi-Spec Sequential Orchestration Specification

## Overview

`/project-orchestrate` currently accepts a single PRD path, a repo identifier, both, or nothing. When a user invokes the skill with multiple PRD paths (e.g., `/project-orchestrate spec-1.md spec-2.md spec-3.md`), the skill's documented behavior is undefined. The executing agent improvises a merge policy at runtime — typically treating all specs as one unified multi-spec project — and produces incoherent design-spike artifacts (one ADR trying to summarize unrelated specs), unpredictable sprint mixing, and run-to-run inconsistency because the merge semantics are agent-invented rather than skill-defined.

This spec formalizes multi-path invocation as **sequential per-spec orchestration**. Each PRD path in the argument list receives its own complete, isolated orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) before the next spec begins. Inter-spec execution order respects optional `depends_on` frontmatter declarations. A `--merged` opt-in flag preserves the existing best-effort multi-spec merge behavior for the rare case it's actually wanted. A `--skip-on-pause` opt-in flag lets the queue continue when one spec's orchestration hits a safety gate.

The change is purely additive at the orchestrator's Input parsing layer. The per-spec orchestration flow — every step of the existing v1.7.1 single-spec behavior — is invoked unchanged once per spec. The two-pass scaffolding and design-spike epic features (v1.7.0) continue to operate per-spec, so each spec retains its own design coherence rather than dissolving into a merged blob.

## Objectives

### Primary Objectives

- Define the behavior of `/project-orchestrate` when given multiple PRD paths so it is predictable, isolated per-spec, and run-to-run consistent.
- Preserve design coherence: each spec gets its own design-spike epic (if triggered), its own ADR, its own emulation pass, its own cleanup pass. No cross-spec contamination.
- Make the simplest user invocation (`/project-orchestrate spec-1.md spec-2.md spec-3.md`) the right invocation. No required flags, no required spelling-out of sequential intent in prompt prose.
- Maintain full backward compatibility: single-path, repo-identifier, and no-arg invocations behave identically to v1.7.1.

### Secondary Objectives

- Allow inter-spec execution-order constraints via `depends_on` frontmatter declarations, with cycle detection up front.
- Provide an opt-in `--skip-on-pause` flag for the case where a queue's progress matters more than catching every safety-gate condition.
- Provide an opt-in `--merged` flag that accepts the multi-path arguments but treats them as one combined project (preserves the existing undefined behavior under explicit user request, deferring formal merged semantics to a follow-up spec).
- Emit a cumulative summary at the end of a multi-spec run that lists per-spec outcomes and aggregate statistics.
- Make multi-spec runs fully resumable: a paused spec can be addressed and the queue continued from the same position without re-running completed specs.

## Requirements

### Functional Requirements

**Mode Detection (Input Parsing)**

- FR-1. When `$ARGUMENTS` contains two or more space-separated tokens AND every token resolves to an existing file path, `/project-orchestrate` MUST enter **multi-path sequential mode**.
- FR-2. When `$ARGUMENTS` contains exactly one token that resolves to a file path, `/project-orchestrate` MUST enter the existing single-spec mode (unchanged from v1.7.1).
- FR-3. When `$ARGUMENTS` contains exactly one token that does NOT resolve to a file path, `/project-orchestrate` MUST enter the existing repo-identifier mode (unchanged from v1.7.1).
- FR-4. When `$ARGUMENTS` contains exactly two tokens — one path-to-existing-file and one non-path — `/project-orchestrate` MUST enter the existing PRD-path-plus-repo-identifier mode (unchanged from v1.7.1).
- FR-5. When `$ARGUMENTS` contains zero tokens, `/project-orchestrate` MUST enter the existing no-arg mode (unchanged from v1.7.1; orchestrates open epics in the configured backlog).
- FR-6. When `$ARGUMENTS` contains two or more tokens where at least one is a path-to-existing-file AND at least one is not a path, `/project-orchestrate` MUST abort with a clear error message stating that mixed path/non-path argument lists are unsupported. The error message MUST list which tokens are paths and which are not.
- FR-7. When `$ARGUMENTS` contains tokens that look like glob patterns (contain `*`, `?`, or `[...]` characters) AND the glob has not been pre-expanded by the shell, `/project-orchestrate` MUST expand the glob itself before applying FR-1 through FR-6.
- FR-8. The chosen mode MUST be announced to the user before any orchestration work begins, including the count of specs in multi-path mode and the resolved execution order after dependency sorting.

**Flag Parsing**

- FR-9. `/project-orchestrate` MUST accept the flag `--skip-on-pause` (default: off). When set in multi-path mode, a spec whose orchestration pauses on a safety gate is marked `skipped` in the queue, its in-progress state file is archived with `.skipped.md` suffix, and the queue advances to the next spec.
- FR-10. `/project-orchestrate` MUST accept the flag `--merged` (default: off). When set with two or more PRD paths, the skill treats the inputs as one combined multi-spec project using the pre-v1.8.0 best-effort merge behavior. The skill MUST emit a warning that merged semantics are not formally specified and recommend `--sequential` (the new default) unless merged behavior is explicitly required.
- FR-11. `--skip-on-pause` and `--merged` are mutually orthogonal flags. The skill MUST accept either, both, or neither.
- FR-12. Unknown flags or invalid flag values MUST cause the skill to abort with an error before starting any orchestration work.

**Dependency Resolution**

- FR-13. Each PRD file MAY declare an optional `depends_on` field in its YAML frontmatter. The value MUST be a YAML list of relative file paths (relative to the PRD file's own directory) or basenames matching other specs in the current invocation's argument list.
- FR-14. Before any spec executes, `/project-orchestrate` MUST resolve the dependency graph: read frontmatter from every spec in the argument list, build a DAG where edges point from depended-upon spec to dependent spec, and produce a topological sort.
- FR-15. The topological sort MUST be **stable**: when two specs have no dependency relationship, the one appearing earlier in the original `$ARGUMENTS` list executes first.
- FR-16. If the dependency graph contains a cycle (including self-dependencies where spec-A declares `depends_on: [spec-A.md]`), `/project-orchestrate` MUST abort with a clear error message naming the cycle members BEFORE starting any spec's orchestration.
- FR-17. If a spec's `depends_on` references a path that is not in the current argument list, `/project-orchestrate` MUST abort with a clear error message naming the missing dependency BEFORE starting any spec's orchestration. (Silent ignoring would lead to subtle wrong-order execution.)
- FR-18. If no spec declares `depends_on`, the execution order is the order tokens appear in `$ARGUMENTS`.

**Per-Spec Execution**

- FR-19. For each spec in the resolved execution order, `/project-orchestrate` MUST invoke the full single-spec orchestration: Phase 1 (Epic Completion Loop) → Phase 2 (Emulation Hardening Loop) → Phase 3 (Project Cleanup) → Step 16 (ADR Update) → Step 17 (State Cleanup).
- FR-20. The per-spec orchestration MUST behave identically to a standalone `/project-orchestrate <spec-path>` invocation. Each spec's design-spike decision, two-pass mode decision, scaffold output, sprint plans, emulation pass, and cleanup pass are independent of sibling specs.
- FR-21. Each spec's orchestration MUST run to completion (or to a safety-gate pause) before the next spec begins. No interleaving of sprints, no concurrent execution.

**State File Lifecycle**

- FR-22. The per-spec orchestration writes to `.claude-scrum-skill/orchestration-state.md` as it does today.
- FR-23. On a spec's successful completion, `/project-orchestrate` MUST archive its state file to `.claude-scrum-skill/orchestration-state-<spec-slug>.previous.md` BEFORE the next spec begins. The `spec-slug` is derived from the spec's filename without extension (e.g., `20260527_215752_multi_spec_sequential_orchestration.md` → `20260527_215752_multi_spec_sequential_orchestration`).
- FR-24. On a spec's safety-gate pause WITHOUT `--skip-on-pause`, the in-progress state file MUST remain at `.claude-scrum-skill/orchestration-state.md` with `Status: paused`. The queue does NOT advance. The queue state file is updated to reflect the paused position. Resume continues from the paused spec.
- FR-25. On a spec's safety-gate pause WITH `--skip-on-pause`, the in-progress state file MUST be archived to `.claude-scrum-skill/orchestration-state-<spec-slug>.skipped.md` and the queue advances to the next spec.
- FR-26. The per-spec orchestration's existing Step 17 (state cleanup via `rm -f`) MUST be suppressed in multi-path mode — the multi-path wrapper handles archival with the slug-suffixed naming instead.
- FR-27. In single-spec mode, state file lifecycle is unchanged from v1.7.1 (archive to `orchestration-state.previous.md` on `Status: completed`, no slug suffix, no queue file).

**Queue State File**

- FR-28. Multi-path mode MUST maintain a queue state file at `.claude-scrum-skill/orchestration-queue-state.md` tracking the entire run. The file is human-readable markdown.
- FR-29. The queue state file MUST be created when multi-path mode starts and updated after every spec status transition (pending → in-progress → completed | paused | skipped).
- FR-30. On clean run completion (all specs completed or skipped), the queue state file MUST be renamed to `orchestration-queue-state.previous.md`.
- FR-31. On a paused run, the queue state file remains in place with `Status: paused` and the paused spec identified, enabling resume on next invocation.
- FR-32. On startup in multi-path mode, `/project-orchestrate` MUST check for an existing queue state file at `.claude-scrum-skill/orchestration-queue-state.md`:
  - `Status: running` → resume from the recorded position (autonomous default per v1.7.1).
  - `Status: paused` → resume from the recorded position.
  - `Status: completed` → rename to `orchestration-queue-state.previous.md` and start a fresh run.
  - No file → initialize a new queue state file.

**Cumulative Summary**

- FR-33. At the end of a multi-path run, `/project-orchestrate` MUST emit a cumulative summary listing each spec's outcome and aggregate statistics. The summary structure mirrors the existing single-spec completion summary, with a per-spec section plus an aggregate header.

### Non-Functional Requirements

- NFR-1. **Backward compatibility.** Single-path invocation (`/project-orchestrate spec.md`), repo-identifier invocation (`/project-orchestrate owner/repo`), single-path + repo invocation (`/project-orchestrate spec.md owner/repo`), and no-arg invocation (`/project-orchestrate`) MUST behave identically to v1.7.1. No new flag is required for the legacy invocations. The v1.7.1 single-spec state file lifecycle (no slug suffix, no queue file) is preserved.
- NFR-2. **Failure isolation.** A safety-gate pause on one spec MUST NOT affect the state files, branches, or backlog of any other spec in the queue. Each spec's orchestration produces its own release branches, story branches, and backlog directories; the multi-path wrapper does not commingle them.
- NFR-3. **Atomicity of pre-execution validation.** Dependency cycle detection, missing-dependency detection, mixed-argument detection, and flag validation MUST all run BEFORE any spec's orchestration begins. The user sees errors immediately, not after partial execution.
- NFR-4. **Resumability.** A multi-path run paused on a safety gate MUST be resumable by re-invoking `/project-orchestrate` with the same arguments. The queue state file's recorded position takes precedence over re-resolving dependencies (so the same execution order is preserved on resume even if a spec's `depends_on` frontmatter changed between attempts).
- NFR-5. **Performance.** Multi-path mode adds no overhead beyond the per-spec orchestration's own runtime. The wrapper logic (dependency resolution, queue state updates, archival) is O(N) in the number of specs and negligible compared to the per-spec work itself.
- NFR-6. **Observability.** Every spec transition (start, completion, pause, skip) MUST be surfaced in the skill's user-facing output AND recorded in the queue state file. The user can re-derive the queue's full history from the queue state file alone.

## Technical Specifications

- **Language/Framework**: Markdown-based skill definitions (no executable code beyond `bash` snippets within `SKILL.md` files). Configuration in JSON. Per-spec state files and the queue state file in human-readable markdown.
- **Dependencies**: No new external dependencies. Uses existing `gh` CLI (GitHub mode), `curl` (Jira/Trello modes), filesystem operations (local mode), and YAML frontmatter parsing the agent already performs for story files.
- **Key Components**:
  - `skills/project-orchestrate/SKILL.md` — primary modification target. Add multi-path detection at the Input parsing layer, dependency resolution procedure, per-spec wrapper loop, queue state file lifecycle, and cumulative summary template.
  - `.claude/skills/project-orchestrate/SKILL.md` — local development copy, mirror the canonical SKILL.md changes.
  - `skills/shared/references/CONVENTIONS.md` — document the new `depends_on` PRD frontmatter field (parallel to the existing story-level `blocked_by` convention).
  - `README.md` — document the new multi-path invocation pattern with examples.
- **Data Structures**:

  **Queue State File** (`.claude-scrum-skill/orchestration-queue-state.md`):

  ```markdown
  # Orchestration Queue State

  ## Meta
  - **Mode:** sequential | merged
  - **Status:** running | paused | completed
  - **Started:** <ISO timestamp>
  - **Last Updated:** <ISO timestamp>
  - **Flags:** --skip-on-pause=<true|false>, --merged=<true|false>

  ## Specs (resolved execution order)
  | # | Spec Path | Slug | Status | Started | Completed | State File Archive |
  |---|-----------|------|--------|---------|-----------|--------------------|
  | 1 | docs/specs/spec-a.md | spec-a | completed | <ts> | <ts> | orchestration-state-spec-a.previous.md |
  | 2 | docs/specs/spec-b.md | spec-b | in-progress | <ts> | — | orchestration-state.md (live) |
  | 3 | docs/specs/spec-c.md | spec-c | pending | — | — | — |

  ## Dependency Graph
  - spec-c depends_on spec-a
  - spec-b depends_on spec-a
  (or "no dependencies declared" if empty)

  ## Aggregate (updated as specs complete)
  - **Total specs:** N
  - **Completed:** N
  - **Paused:** N (current: <spec-slug>, if any)
  - **Skipped:** N
  - **Pending:** N
  - **Total stories delivered (across completed specs):** N
  - **Total sprints executed:** N
  - **Total ADRs created:** N

  ## Log
  - [<ts>] Multi-path run started — 3 specs in scope
  - [<ts>] Dependency graph resolved — execution order: spec-a, spec-b, spec-c
  - [<ts>] Spec 1/3 (spec-a) started
  - [<ts>] Spec 1/3 (spec-a) completed — 12 stories, 3 sprints
  - [<ts>] Spec 2/3 (spec-b) started
  ```

  **Per-spec state file** (`.claude-scrum-skill/orchestration-state.md`): unchanged from v1.7.1. Same shape as today.

  **Spec PRD frontmatter `depends_on` field**:

  ```yaml
  ---
  title: My Spec
  depends_on:
    - other-spec.md            # basename match against other args
    - subdir/another-spec.md   # path match relative to this spec's directory
  ---
  ```

- **APIs/Interfaces**: No new external APIs. The wrapper logic calls the existing per-spec orchestration as a subroutine. New internal interface is the queue state file shape (durable, on-disk).

### Spec Slug Derivation

A spec's slug is computed from its filename:
- Filename: `20260527_215752_multi_spec_sequential_orchestration.md`
- Slug: `20260527_215752_multi_spec_sequential_orchestration`

Rule: `basename(path, ".md")`. If two specs in the same invocation produce the same slug (e.g., one is `foo/spec.md`, another is `bar/spec.md`), the skill MUST abort with an error before starting any spec — slug collisions would clobber each other's archived state files.

### Dependency Path Resolution

When resolving `depends_on` entries:
1. Try as a relative path from the declaring spec's directory.
2. If that doesn't match any argument-list spec, try as a basename match.
3. If neither matches, abort with FR-17's missing-dependency error.

Normalization: both sides of the comparison use canonical absolute paths derived via the same resolution function, so `./foo.md` and `foo.md` and `/abs/path/foo.md` all match the same target.

## User Experience

### Simple Multi-Path Invocation

```
/project-orchestrate spec-1.md spec-2.md spec-3.md
```

Announcement before execution begins:

```
Multi-path orchestration mode: 3 specs detected.

Dependency graph: no depends_on declarations — using argument order.
Execution order:
  1. spec-1.md
  2. spec-2.md
  3. spec-3.md

Flags: none.

Starting Spec 1/3 — spec-1.md
```

### Glob Invocation (Pre-Expanded by Shell)

```
/project-orchestrate docs/specs/2026Q2-*.md
```

The shell expands the glob; the skill sees the expanded paths and treats them as multi-path mode.

### Glob Invocation (Unexpanded by Shell)

If `$ARGUMENTS` arrives as the literal string `docs/specs/2026Q2-*.md`, the skill detects the glob characters and expands them itself before applying mode detection.

### Dependency Override of Argument Order

PRD `spec-b.md` declares:

```yaml
---
title: Spec B
depends_on:
  - spec-a.md
---
```

Invocation: `/project-orchestrate spec-b.md spec-a.md spec-c.md`

Execution order: `spec-a.md, spec-b.md, spec-c.md` (spec-a moves before spec-b due to dependency; spec-c retains its position relative to others). Announcement:

```
Multi-path orchestration mode: 3 specs detected.

Dependency graph:
  spec-b.md depends_on: [spec-a.md]

Execution order (topologically sorted, ties broken by argument order):
  1. spec-a.md  (required by spec-b)
  2. spec-b.md
  3. spec-c.md  (no dependencies)
```

### Cycle Detection (Aborted Run)

PRD `spec-a.md`: `depends_on: [spec-b.md]`
PRD `spec-b.md`: `depends_on: [spec-a.md]`

Invocation: `/project-orchestrate spec-a.md spec-b.md`

```
ERROR: Dependency cycle detected. No specs were started.

Cycle members:
  spec-a.md → depends_on: spec-b.md
  spec-b.md → depends_on: spec-a.md

Resolve the cycle (remove one of the declarations) and re-run.
```

### Safety-Gate Pause (Default Behavior)

```
[Spec 2/3] spec-b.md — paused on safety gate.

Pause reason: 3rd consecutive hardening run produced 2 critical findings
(see .claude-scrum-skill/reports/emulation-report/ISSUES.md).

Remaining specs (1) are not started. Queue state preserved at
.claude-scrum-skill/orchestration-queue-state.md.

Resolve the findings and re-invoke /project-orchestrate with the same
arguments to resume. The queue picks up at spec-b.md.
```

### Safety-Gate Pause with `--skip-on-pause`

```
[Spec 2/3] spec-b.md — paused on safety gate. --skip-on-pause set; marking skipped.

Skipped reason: 3rd consecutive hardening run produced 2 critical findings.
State archived to .claude-scrum-skill/orchestration-state-spec-b.skipped.md.

Continuing to Spec 3/3 — spec-c.md
```

### Cumulative Summary

```
## Multi-Spec Orchestration Complete

### Aggregate
- Specs in queue: 3
- Completed: 2 (spec-a, spec-c)
- Skipped: 1 (spec-b, paused on 3rd hardening run; archived)
- Total stories delivered: 27 (44 story points)
- Total sprints: 7
- Total ADRs created: 3
- Total duration: 4h 12m

### Per-Spec

#### spec-a.md  ✅ Completed
- 3 sprints, 12 stories, 18 points
- Design-spike: yes (ADR-0007, 2 CONTEXT.md files)
- Emulation runs: 1 (clean)
- Cleanup: PASS
- State archive: orchestration-state-spec-a.previous.md
- ADR: docs/adrs/0007-spec-a-architecture.md

#### spec-b.md  ⚠️ Skipped (paused, --skip-on-pause)
- 2 sprints, 8 stories, 13 points completed before pause
- Pause reason: 3rd hardening run produced 2 critical findings
- State archive: orchestration-state-spec-b.skipped.md
- Report: .claude-scrum-skill/reports/emulation-report/ISSUES.md

#### spec-c.md  ✅ Completed
- 4 sprints, 15 stories, 26 points
- Design-spike: no (single epic)
- Emulation runs: 2 (clean after hardening)
- Cleanup: PASS
- State archive: orchestration-state-spec-c.previous.md
- ADR: docs/adrs/0008-spec-c-architecture.md
```

### `--merged` Flag (Opt-In, Deferred Semantics)

```
/project-orchestrate --merged spec-1.md spec-2.md spec-3.md
```

Announcement:

```
WARNING: --merged is set. Multi-path inputs will be treated as one combined
project with best-effort merge semantics. Formal merged behavior is not
yet specified (deferred to a follow-up spec); results may be inconsistent
run-to-run.

If you want predictable per-spec isolation, drop --merged and re-run.

Proceeding with merged mode...
```

Then runs the v1.7.x-equivalent unified multi-spec scaffold + orchestration, as the agent previously did by default.

## Architecture

### Component Diagram

```
                        $ARGUMENTS
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │   /project-orchestrate Input Parser    │
        │  - Tokenize, separate flags from args  │
        │  - Resolve glob patterns (if any)      │
        │  - Classify each arg: file? non-file?  │
        │  - Validate flags                      │
        └───────────────┬───────────────────────┘
                        │
            ┌───────────┼───────────┬─────────────────┬──────────────────┐
            │           │           │                 │                  │
            ▼           ▼           ▼                 ▼                  ▼
        [0 args]   [1 path]   [1 path + 1     [1 repo-id only]    [2+ paths]
                              repo-id]                            (existing OR
                                                                  --merged)
            │           │           │                 │                  │
            │           │           │                 │              ┌───┴────┐
            │           │           │                 │              │        │
            ▼           ▼           ▼                 ▼              ▼        ▼
       no-arg      single-     single-spec      repo-id mode    sequential  merged
       mode        spec        + repo mode      (v1.7.1)        mode (NEW)  mode
       (v1.7.1)    mode        (v1.7.1)                                     (legacy +
                   (v1.7.1)                                                  warning)
                                                                       │
                                                                       ▼
                                            ┌──────────────────────────────────┐
                                            │  Dependency Resolution           │
                                            │  - Read frontmatter from all     │
                                            │    specs                         │
                                            │  - Build DAG                     │
                                            │  - Detect cycles → abort         │
                                            │  - Detect missing deps → abort   │
                                            │  - Topological sort              │
                                            └─────────────────┬────────────────┘
                                                              │
                                                              ▼
                                            ┌──────────────────────────────────┐
                                            │  Queue State File Init           │
                                            │  - Create .../orchestration-     │
                                            │    queue-state.md                │
                                            │  - Record execution order        │
                                            │  - Status: running               │
                                            └─────────────────┬────────────────┘
                                                              │
                                                              ▼
                                            ┌──────────────────────────────────┐
                                            │  Per-Spec Loop                   │
                                            │  For each spec in order:         │
                                            │    1. Update queue: in-progress  │
                                            │    2. Invoke per-spec            │
                                            │       orchestration (v1.7.1      │
                                            │       single-spec flow)          │
                                            │    3. On completion:             │
                                            │       - Archive state file with  │
                                            │         slug suffix              │
                                            │       - Update queue: completed  │
                                            │    4. On safety-gate pause:      │
                                            │       - With --skip-on-pause:    │
                                            │         archive with .skipped.md │
                                            │         and continue             │
                                            │       - Without flag: update     │
                                            │         queue: paused, exit      │
                                            └─────────────────┬────────────────┘
                                                              │
                                                              ▼
                                            ┌──────────────────────────────────┐
                                            │  Cumulative Summary              │
                                            │  - Per-spec section              │
                                            │  - Aggregate stats               │
                                            │  - Queue state → completed       │
                                            │  - Archive queue file            │
                                            └──────────────────────────────────┘
```

### Data Flow

1. User invokes `/project-orchestrate spec-1.md spec-2.md ... spec-N.md [--flag ...]`.
2. Input Parser tokenizes args, separates flags, resolves any unexpanded globs, classifies each remaining token as path-to-existing-file or non-path.
3. Mode classification (FR-1 through FR-6) selects sequential, merged, single-spec, repo-id, single-spec+repo, or no-arg mode.
4. **Sequential mode branch (new):**
   a. Read frontmatter from every spec; build dependency DAG.
   b. If cycle → abort with named cycle members.
   c. If missing dep → abort with named missing dep.
   d. Topological sort with stable tie-break on argument order.
   e. Announce decision and execution order.
   f. Initialize queue state file with `Status: running`.
   g. For each spec in order:
      i. Mark queue entry `in-progress`.
      ii. Invoke per-spec orchestration (the existing v1.7.1 single-spec flow), which produces release branches, executes sprints, runs emulation, runs cleanup, updates ADRs.
      iii. On natural completion: archive `.../orchestration-state.md` → `.../orchestration-state-<slug>.previous.md`. Mark queue entry `completed`. Update aggregate stats.
      iv. On safety-gate pause:
         - Without `--skip-on-pause`: mark queue entry `paused`, update queue `Status: paused`, exit. State file remains at canonical location for the per-spec resume logic to find on next invocation.
         - With `--skip-on-pause`: archive `.../orchestration-state.md` → `.../orchestration-state-<slug>.skipped.md`. Mark queue entry `skipped`. Continue to next spec.
   h. After all specs: emit cumulative summary, mark queue `Status: completed`, archive queue file → `.../orchestration-queue-state.previous.md`.
5. **Merged mode branch:** emit deprecation warning, fall through to the legacy v1.7.x undefined-but-best-effort behavior (scaffold all specs into one project, run as a unified multi-epic project). No new logic.
6. **Single-spec / repo-id / no-arg branches:** unchanged from v1.7.1.

### Integration Points

- **`/project-scaffold`** — no changes. The per-spec wrapper calls scaffold once per spec with the spec's own path. Each scaffold call gets its own Mode Detection (two-pass vs single-pass) and design-spike decision based on that one spec's size/structure.
- **`/sprint-plan`, `/sprint-release`, `/sprint-status`** — no changes. Each spec's orchestration invokes these as it does today.
- **`/project-emulate`** — no changes. Runs once per spec, against the spec's own change set.
- **`/project-cleanup`** — no changes. Runs once per spec.
- **State file format** — unchanged for per-spec state. Queue state file is a new artifact at a new path (`.claude-scrum-skill/orchestration-queue-state.md`).
- **`CONVENTIONS.md`** — add documentation for the `depends_on` PRD frontmatter field. Parallel to the existing story-level `blocked_by` convention.

### System Boundaries

- This change is contained to `skills/project-orchestrate/SKILL.md` (and its `.claude/` mirror) plus minor additions to `CONVENTIONS.md` and `README.md`.
- No changes to scaffold, sprint skills, emulation, cleanup, spec.
- No changes to per-spec state file format.
- The queue state file is a new, separate artifact.

## Implementation Plan

### Phase 1 — Foundation

1. Update `skills/shared/references/CONVENTIONS.md` (and `.claude/` mirror) to document the new `depends_on` PRD frontmatter field, including the path-or-basename resolution rule (FR-13) and the abort-on-missing rule (FR-17).
2. Update `README.md` to document the multi-path invocation pattern with examples (simple list, glob, dependency override, --skip-on-pause, --merged warning). Add to the Tips section.

### Phase 2 — Input Parsing and Mode Detection

3. Insert a new "Input Parsing and Mode Detection" section near the top of `skills/project-orchestrate/SKILL.md`, between the existing "Input" and "Default Operating Mode" sections.
4. Document the seven mode-classification cases (FR-1 through FR-6 plus the no-arg case), the announcement format (FR-8), and the abort-on-mixed-arg rule.
5. Document the flag parsing (`--skip-on-pause`, `--merged`) and the unknown-flag abort rule (FR-9 through FR-12).
6. Document glob detection and expansion (FR-7).

### Phase 3 — Dependency Resolution

7. Insert a "Dependency Resolution" subsection inside the new Input Parsing section, applicable only to sequential mode (and merged mode if desired).
8. Document the YAML frontmatter shape for `depends_on`, the path resolution rules, cycle detection algorithm, missing-dep detection, topological sort with stable tie-break.
9. Specify the exact error message formats for cycle and missing-dep aborts (FR-16, FR-17).

### Phase 4 — Sequential Execution Wrapper

10. Insert a new top-level section "## Sequential Multi-Path Mode" in `skills/project-orchestrate/SKILL.md` after the existing Phase 3 / completion summary sections.
11. Document the per-spec loop, the state file archival rules (FR-22 through FR-27), and the queue state file lifecycle (FR-28 through FR-32).
12. Document the safety-gate pause behaviors (both default and with `--skip-on-pause`), including the announcement format and resume semantics.

### Phase 5 — Cumulative Summary

13. Add a "Cumulative Summary" subsection at the end of the Sequential Multi-Path Mode section documenting the summary format (FR-33), mirroring the existing single-spec completion summary structure.

### Phase 6 — Merged Mode Acceptance

14. Add a brief "Merged Mode (Opt-In)" subsection documenting that `--merged` accepts multi-path arguments and treats them as a single combined project using best-effort legacy behavior. Include the deprecation warning text (FR-10). Note that formal merged semantics are deferred to a follow-up spec.

### Phase 7 — Documentation Surface

15. Update `skills/project-orchestrate/SKILL.md` "Before You Start" to mention the new flags briefly.
16. Update `CHANGELOG.md` with a `[1.8.0]` entry under Keep a Changelog format documenting the additions.
17. Bump `package.json` version from `1.7.1` to `1.8.0`.

## Testing Strategy

The skill suite has no automated test framework. Verification is observational against synthetic input fixtures, run by hand or by a future verification harness.

### Verification Fixtures

Add to `docs/specs/_fixtures/`:

- `multi_spec_a.md`, `multi_spec_b.md`, `multi_spec_c.md` — three minimal specs (one epic each, no `depends_on`).
- `multi_spec_dep_chain_a.md`, `multi_spec_dep_chain_b.md`, `multi_spec_dep_chain_c.md` — three specs where `b` depends on `a` and `c` depends on `b`.
- `multi_spec_cycle_x.md`, `multi_spec_cycle_y.md` — two specs forming a cycle (`x` → `y`, `y` → `x`).
- `multi_spec_missing_dep.md` — a spec declaring `depends_on: [does-not-exist.md]`.

### Verification Matrix

| # | Case | Input | Expected |
|---|------|-------|----------|
| 1 | Three independent specs in order | `/project-orchestrate multi_spec_a.md multi_spec_b.md multi_spec_c.md` | All three execute in order; three completion archives; cumulative summary; queue file archived. |
| 2 | Dependency override of arg order | `/project-orchestrate multi_spec_dep_chain_c.md multi_spec_dep_chain_a.md multi_spec_dep_chain_b.md` | Execution order: a, b, c. Announced before execution. |
| 3 | Cycle detection | `/project-orchestrate multi_spec_cycle_x.md multi_spec_cycle_y.md` | Aborts before any spec runs; error names both cycle members. |
| 4 | Missing dependency | `/project-orchestrate multi_spec_missing_dep.md` | Aborts before any spec runs; error names the missing dep. |
| 5 | Mixed args (path + non-path) | `/project-orchestrate multi_spec_a.md houseofwolvesllc/some-repo multi_spec_b.md` | Aborts with FR-6 error; lists which tokens are paths and which are not. |
| 6 | Single-path invocation | `/project-orchestrate multi_spec_a.md` | Identical to v1.7.1 behavior; archives to `orchestration-state.previous.md` (no slug suffix); no queue file created. |
| 7 | Repo-identifier invocation | `/project-orchestrate owner/repo` | Identical to v1.7.1 behavior. |
| 8 | No-arg invocation | `/project-orchestrate` | Identical to v1.7.1 behavior. |
| 9 | `--skip-on-pause` with simulated pause | Craft a fixture that triggers a safety-gate pause (e.g., a story with deliberately bad acceptance criteria that fail review); invoke with `--skip-on-pause` | Paused spec marked skipped, archived with `.skipped.md` suffix; queue advances. |
| 10 | Pause without `--skip-on-pause` | Same fixture, no flag | Queue pauses; remaining specs untouched; re-invocation resumes from paused spec. |
| 11 | Unexpanded glob | Invoke with literal `docs/specs/_fixtures/multi_spec_*.md` (where shell does not expand) | Skill expands the glob and treats as multi-path. |
| 12 | Slug collision | Create two specs with the same basename in different directories; invoke with both | Aborts with slug-collision error before any spec runs. |
| 13 | `--merged` flag | `/project-orchestrate --merged multi_spec_a.md multi_spec_b.md` | Emits warning; falls through to legacy unified-multi-spec behavior. |
| 14 | Resume after pause | Run case 10, address the pause cause, re-invoke same command | Queue resumes from the paused spec; completed specs are not re-executed. |
| 15 | Multi-path mode with single spec passing | `/project-orchestrate multi_spec_a.md` (one path; identical to case 6) | Single-spec mode, NOT multi-path. Confirms FR-1's "two or more" threshold. |

### Manual Verification Notes

- Cases 9, 10, 14 require fixtures that trigger safety gates. The simplest is a deliberately-bad acceptance criterion that the review persona flags as critical.
- All verification is observational — inspect the backlog, state files, queue file, and skill output to confirm expected structure. The fixtures are checked in; the actual runs happen post-merge as part of QA.

## Future Considerations

### Potential Extensions

- **Formalize `--merged` semantics.** A follow-up spec defines the merged behavior: shared design-spike across specs, cross-spec dependency resolution, unified state file vs queue file, how Mode Detection's word-count heuristic applies to the union, etc. The current v1.8.0 just accepts the flag with a deprecation-style warning; the next spec replaces "best-effort" with a defined contract.
- **Parallel multi-spec execution.** A `--parallel` flag would run N specs concurrently up to a concurrency cap. Significantly more complex: requires per-spec working directories or git worktrees to avoid branch conflicts, separate state file paths per spec, parallel sprint plans without interference, and a different summary aggregation model. Out of scope for v1.8.0.
- **Per-spec flag overrides.** Currently `--skip-on-pause` applies globally to the queue. A future enhancement could allow per-spec opt-out via frontmatter: `skip_on_pause: false` overrides the global flag for that spec. Useful when one critical spec must pause-and-wait while the rest of the queue is fine with skipping.
- **Queue resumption with modified arguments.** Currently resume requires identical argument list. A future enhancement could allow adding new specs to a paused queue, or removing specs from the remaining queue, without losing completed work.
- **Skip already-completed specs on re-invocation.** If the user re-invokes `/project-orchestrate spec-a.md spec-b.md spec-c.md` after a previous successful run, currently the queue file is at `completed` status and gets archived; a fresh run starts. A future enhancement could detect that some specs in the new invocation match completed archives and offer to skip them.
- **Multi-spec emulation.** Currently each spec gets its own emulation pass. A future enhancement could run a single combined emulation pass after all specs complete, catching cross-spec integration issues that per-spec emulation misses. Significant design work; would interact with the merged-mode spec.

### Scalability Considerations

- **Many specs (>20).** The wrapper logic is O(N), but each spec's orchestration is hours. 20 specs sequentially is a multi-day run. Realistic ceiling for a single invocation is probably 5-10 specs; beyond that, users likely want to chunk the queue manually.
- **Deep dependency chains.** The topological sort is O(N + E) in spec count and dependency count. No practical concern at the spec scale; thousands of specs with hundreds of dependencies would still resolve in milliseconds.
- **Queue state file growth.** Each spec adds a row to the queue file and an append-only log entry. For a 50-spec queue, the file is ~10KB. Not a concern.

### Long-term Maintenance Notes

- The multi-path wrapper is additive over the existing single-spec orchestration. If the wrapper proves problematic, it can be effectively disabled by documenting that multi-path mode is deprecated; users would revert to invoking the skill once per spec from a shell loop. The per-spec orchestration is unchanged and would continue to work.
- The queue state file shape is a new internal contract. It can evolve freely as long as the parsing logic in the wrapper updates with the shape. The file is human-readable and recoverable by hand if the schema changes between runs (existing queue files would need migration or fresh-start).
- The `depends_on` PRD frontmatter field is a new public contract that PRD authors will rely on. Changing its meaning or removing it requires a major version bump and a migration story.
- Slug derivation (`basename(path, ".md")`) is simple and stable, but if filename conventions change, the slug rule may need updating. The slug-collision detection (FR-23 implicit + the abort rule) prevents silent corruption.
- The `--merged` flag's "semantics TBD" status is technical debt by design. The follow-up spec to formalize merged behavior should land within a few releases; if it doesn't, users will accumulate dependence on the undefined behavior and future formalization becomes a breaking change.
