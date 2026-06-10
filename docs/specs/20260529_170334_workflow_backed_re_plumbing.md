# v2.0.0 — Workflow-Backed Re-Plumbing Specification

## Overview

claudescrumskill v1.x evolved into a comprehensive scrum-pipeline skill suite using markdown SKILL.md documents to encode policy and procedure. Inside several skills — most prominently `/project-orchestrate` and `/project-scaffold` — hundreds of lines of prose describe **how** to spawn subagents, fan out work in parallel, parse their free-text returns, and persist results. This works, but it operates against three real limits:

1. **Cross-skill hand-offs go through markdown round-trips.** When `/project-spec` produces a spec, `/project-scaffold` re-parses the markdown to extract epics and stories. When `/project-scaffold` produces a backlog, `/project-orchestrate` re-reads the files. Every boundary is a free-text interpretation step that introduces drift and rework.
2. **Parallelism is capped at 3 with per-stage barriers.** The current Task-based fan-out in `/project-orchestrate` Phase 1 Step 3 (sprint execution) and `/project-scaffold` Pass 2 (per-epic elaboration) caps concurrency at 3 and waits for each stage to fully complete before the next begins. On non-trivial sprints this is real wall-clock cost.
3. **Verbose policy prose competes with autonomous execution.** Long, descriptive sections describing "spawn N subagents and..." invite interpretation rather than execution, even with the v1.7.1 imperative autonomous-default rewrite.

Claude Code workflows — a deterministic JavaScript orchestration substrate with `agent()`, `parallel()`, `pipeline()`, schema-validated returns, journal-based resume, and concurrency up to 16 — provide a clean substrate for fan-out, structured returns, and pre-validated cross-skill data. This spec describes **v2.0.0** as a re-plumbing that keeps every skill's markdown surface and slash-command name unchanged while migrating the fan-out, journaling, and text-parsing internals to workflow scripts shipped with the npm package.

The user-facing experience is identical to v1.8.1. The substrate underneath is different. The package becomes more capable, smaller in prose, and faster on multi-story sprints. ADR-0003 captures the architectural shift.

## Objectives

### Primary Objectives

- **Migrate fan-out to workflows.** Replace the Task-spawning prose in `/project-orchestrate` Phase 1 Step 3, `/project-scaffold` Pass 2, `/project-orchestrate` v1.8.0 multi-spec queue, `/project-emulate` findings triage, and the review gates in `/project-cleanup` and `/code-review` with invocations of dedicated workflow scripts.
- **Introduce schema-validated cross-skill hand-offs.** Define JSON Schemas for the cross-skill data types (Spec, Epic, Story, EmulationFinding, ReviewVerdict, SprintStoryReturn, ScaffoldOutput, PRDFrontmatter) so workflows return validated typed structures and consuming skills no longer re-parse markdown.
- **Preserve the markdown skill surface.** Every slash command (`/project-orchestrate`, `/project-scaffold`, etc.) continues to work unchanged. Users see no UX change.
- **Preserve durable repo artifacts.** `orchestration-state.md`, `orchestration-queue-state.md`, ADRs, CONTEXT.md files, and CHANGELOG entries remain as markdown files in the repo, readable by humans and recoverable across sessions.

### Secondary Objectives

- Reduce the average SKILL.md size by deleting prose that workflow scripts now encode. Target: at least 30% line reduction in `/project-orchestrate/SKILL.md` (currently ~1100 lines).
- Provide observable performance improvement on a 10-story sprint: concurrency lifts from 3 to 16; per-stage barriers collapse; wall-clock improvement measurable in real runs.
- Establish a clear contributor convention for adding new workflows in future versions.
- Document the architectural shift in ADR-0003 so future contributors understand WHY skills became thinner.

## Requirements

### Functional Requirements

**Package Structure**

- FR-1. A new top-level directory `lib/workflows/` MUST be added to the npm package root, sibling of `skills/`, `bin/`, and `.claude-plugin/`.
- FR-2. Workflow scripts MUST live as individual JavaScript files under `lib/workflows/` (one file per workflow).
- FR-3. JSON Schemas MUST live under `lib/workflows/schemas/`, one file per schema, named `<SchemaName>.json` in PascalCase.
- FR-4. `package.json`'s `files` field MUST include `lib/` so workflows ship in the published npm tarball.
- FR-5. `bin/install.js` MUST copy `lib/workflows/` to `<install-skills-dir>/_workflows/` during postinstall. The underscore prefix prevents Claude Code from interpreting the directory as a skill (skills require a `SKILL.md` file).

**Workflow Scripts**

- FR-6. `lib/workflows/sprint_pipeline.js` MUST implement per-story sprint execution as a `pipeline(stories, implement, review, verify, openPR)` returning an array of `SprintStoryReturn`-shaped objects.
- FR-7. `lib/workflows/elaborate_epics.js` MUST implement Pass 2 of two-pass scaffolding as `parallel(epics.map(epic => elaborate(epic)))`, each elaborator producing an `Epic`-shaped object with `stories[]` populated.
- FR-8. `lib/workflows/multi_spec_queue.js` MUST implement the v1.8.0 multi-spec sequential queue as `pipeline(specs, scaffoldStage, sprintStage, releaseStage, cleanupStage)`. Each stage MAY invoke a sub-workflow via `workflow()` once (nesting is one level only per the Workflow tool's constraints).
- FR-9. `lib/workflows/adversarial_verify.js` MUST implement claimant / skeptic / judge verification on emulation findings, returning a per-finding verdict with evidence and counter-evidence.
- FR-10. `lib/workflows/review_panel.js` MUST implement multi-lens judge-panel review (correctness, security, style, tests) across a change set, returning per-lens and aggregated verdicts.
- FR-11. Each workflow script MUST use schema-validated `agent()` calls where structured returns are needed. Schemas are referenced from `lib/workflows/schemas/`.
- FR-12. Each workflow script MUST handle agent failures gracefully per the Workflow tool patterns: `parallel()` failures return null for the failed agent (filter with `.filter(Boolean)`); pipeline failures drop the failed item from later stages; failures are surfaced in the workflow return value with explicit structure (e.g., `{ status: "blocked", reason: "..." }`).

**JSON Schemas**

- FR-13. `lib/workflows/schemas/SpecSchema.json` MUST define the output shape of `/project-spec`: `{ title, overview, objectives: {primary[], secondary[]}, epics: Epic[], dependencies, design_concerns, scaffold_mode?, design_spike? }`.
- FR-14. `lib/workflows/schemas/EpicSchema.json` MUST define `{ name, slug, description, depends_on: string[], shared_design_concerns: string[], stories?: Story[] }` (stories optional until Pass 2 elaborates them).
- FR-15. `lib/workflows/schemas/StorySchema.json` MUST define `{ title, slug, acceptance_criteria: string[], technical_context, points: number, executor: "claude"|"human"|"cowork", persona?: string, blocked_by: string[], blocks: string[], labels: string[] }`.
- FR-16. `lib/workflows/schemas/EmulationFindingSchema.json` MUST define `{ id, severity: "critical"|"warning"|"info", category, title, body, affected_files: string[] }`.
- FR-17. `lib/workflows/schemas/ReviewVerdictSchema.json` MUST define `{ recommendation: "accept"|"accept-with-followups"|"block", findings: { critical: Finding[], warning: Finding[], info: Finding[] }, summary }` where `Finding = { title, location, severity, body }`.
- FR-18. `lib/workflows/schemas/SprintStoryReturnSchema.json` MUST define `{ storySlug, status: "done"|"blocked"|"failed", branch, prUrl?, commits: string[], blockers?: string[], reason? }`.
- FR-19. `lib/workflows/schemas/ScaffoldOutputSchema.json` MUST define `{ scope: "prd"|"all", scopedEpics: string[], scopedStories: string[], designSpikeEpic?: string, queueStateFilePath?: string }`.
- FR-20. `lib/workflows/schemas/PRDFrontmatterSchema.json` MUST define `{ title?: string, scaffold_mode?: "single-pass"|"two-pass", design_spike?: boolean, depends_on?: string[] }`.

**Skill Markdown Rewrites**

- FR-21. `/project-orchestrate` Phase 1 Step 3 (Story Execution) MUST be rewritten to instruct the executing agent to invoke `sprint_pipeline.js` via the Workflow tool. The verbose Task-spawning prose MUST be removed. The new section MUST specify: the workflow's input args, the expected return shape (`SprintStoryReturn[]`), the per-story persistence step (update story frontmatter to `status: done` / `status: blocked`), and the failure handling (mark blocked, continue with siblings).
- FR-22. `/project-orchestrate` Sequential Multi-Path Mode section MUST be rewritten to invoke `multi_spec_queue.js` instead of narrating the per-spec loop in prose. The queue state file format remains; the workflow writes to it.
- FR-23. `/project-scaffold` Two-Pass Procedure Pass 2 section MUST be rewritten to invoke `elaborate_epics.js`. Pass 1 narration (single agent reading the whole PRD to produce the skeleton) is unchanged.
- FR-24. `/project-emulate` MUST gain a new "Verification" step after the existing findings discovery, instructing the executing agent to invoke `adversarial_verify.js` on the findings list. The output replaces the raw findings with verified findings (each tagged real / false-positive / needs-more-evidence).
- FR-25. `/project-cleanup` and `/code-review` MUST be rewritten to invoke `review_panel.js` for the review gate. The output replaces single-pass reviewer output with multi-lens verdicts.
- FR-26. `/project-spec` MUST be rewritten to produce a `SpecSchema`-validated structured output in addition to (NOT in place of) the existing markdown spec document. The structured output is written alongside the markdown to a sibling JSON file: `<specs-path>/<timestamp>_<name>.spec.json`. Downstream skills consume the JSON for typed access; the markdown remains for human readability.

**Workflow Tool Availability**

- FR-27. v2.0.0 MUST require the Claude Code Workflow tool to function. Skills MUST NOT carry a fallback path to the v1.x Task-spawning prose.
- FR-28. Each affected skill's "Before You Start" section MUST add a check: "Confirm the Workflow tool is available in this session. If not, v2.0.0 is incompatible — install v1.8.x as a fallback."
- FR-29. The README MUST explicitly state that v2.0.0 requires a Claude Code version that ships the Workflow tool, and that v1.8.x remains available for older Claude Code installs.

**State File Integration**

- FR-30. `orchestration-state.md` and `orchestration-queue-state.md` MUST remain in their v1.8.x formats and locations. Workflows write to them via file I/O (their agents have Bash/Write/Edit tool access).
- FR-31. Workflows MUST surface their journal-based `runId` to the calling skill so the skill can record it in the state file. On in-session resume, the skill invokes the Workflow tool with `resumeFromRunId` and the prior run continues from the journal.
- FR-32. Cross-session resume continues to work via the skill markdown reading the state file and re-invoking the appropriate workflow with the saved progress — workflows themselves do not survive sessions, but the skill's state file does.

**Workflow Script Resolution at Runtime**

- FR-33. The skill markdown MUST instruct the executing agent to resolve workflow script paths relative to the skill's install location: `<skills-dir>/_workflows/<script>.js`. The skill MUST describe this resolution algorithm explicitly so the agent does not need to guess.
- FR-34. The plugin install path (Claude Code marketplace `/plugin install`) MUST work: when the plugin's skills are namespaced under `@<org>/<plugin>/`, the workflows ship in the same plugin install location and the path resolution still produces a valid absolute path. `bin/install.js` is the canonical copier for both paths.

**Versioning and Distribution**

- FR-35. `package.json` version MUST bump from `1.8.1` to `2.0.0`. The bump is major because v2.0.0 requires the Workflow tool, which is a hard runtime requirement change that breaks installs on older Claude Code without Workflow.
- FR-36. `CHANGELOG.md` MUST gain a `[2.0.0]` entry under Keep a Changelog format with explicit sections: Added (workflows, schemas, ADR-0003), Changed (all skill rewrites), Removed (the Task-spawning prose, fallback paths), and **Migration** (a dedicated subsection explaining what users see — nothing — and what plugin extension authors see).
- FR-37. The npm publish workflow at `.github/workflows/publish.yml` MUST work unchanged. Version detection sees 2.0.0 isn't published, publishes via OIDC, tags `v2.0.0`.

**README Updates**

- FR-38. README MUST gain a new "Architecture" subsection (under Installation or as a sibling) documenting the lib/workflows layer for contributors.
- FR-39. README MUST add a "v2.0.0 requirements" callout near the top noting the Workflow tool requirement and pointing users on older Claude Code to v1.8.x.

### Non-Functional Requirements

- NFR-1. **Backward compatibility of user surface.** Every slash command, every prompt the user types, every PRD frontmatter field, every state file format, every ADR / CONTEXT.md / report file MUST behave identically to v1.8.1. The change is internal-only.
- NFR-2. **Backward compatibility of state files.** A v1.8.x `orchestration-state.md` or `orchestration-queue-state.md` MUST be readable by v2.0.0 skills on cross-session resume. The format is unchanged.
- NFR-3. **Performance.** On a 10-story sprint, v2.0.0's sprint pipeline MUST achieve at least 2× wall-clock improvement over v1.8.1's 3-concurrent Task fan-out, measured on the same input set. The improvement comes from concurrency lift (3 → 16) and the loss of per-stage barriers in `pipeline()` semantics.
- NFR-4. **Atomicity of installation.** `bin/install.js` MUST copy both skills and workflows in one pass. A partial install (skills copied, workflows missing) is not a supported state.
- NFR-5. **Failure isolation.** A workflow failure on one story / epic / spec MUST NOT cascade to siblings. `pipeline()` and `parallel()` semantics already provide this; the workflow scripts MUST surface per-item failures explicitly so the calling skill can persist them to the state file.
- NFR-6. **Reduced SKILL.md prose.** The `/project-orchestrate/SKILL.md` line count MUST decrease by at least 30% in v2.0.0 (from ~1100 lines to under ~770 lines). The deleted content is the Task-spawning narration that now lives in workflow scripts.
- NFR-7. **Schema portability.** JSON Schemas MUST be vanilla JSON Schema Draft 2020-12 (the Workflow tool's `schema` option format). No proprietary extensions.
- NFR-8. **Observability.** Workflow runs surface progress through the Workflow tool's existing UI (live progress, structured task notifications). Skill markdown does not duplicate this UI in prose.

## Technical Specifications

- **Language/Framework**: Markdown (SKILL.md), JavaScript (workflow scripts, ES2024), JSON (schemas, package.json).
- **Dependencies**: No new external dependencies. Uses the Claude Code Workflow tool, `agent()`, `parallel()`, `pipeline()`, `workflow()` (one-level nesting), and the existing `gh` CLI / `curl` / filesystem tools for backend operations.
- **Key Components**:
  - `lib/workflows/sprint_pipeline.js` — per-story sprint execution
  - `lib/workflows/elaborate_epics.js` — Pass 2 epic elaboration
  - `lib/workflows/multi_spec_queue.js` — multi-spec sequential queue
  - `lib/workflows/adversarial_verify.js` — findings verification
  - `lib/workflows/review_panel.js` — multi-lens review
  - `lib/workflows/schemas/*.json` — 8 JSON Schemas
  - `bin/install.js` — updated to copy `lib/workflows/` to `<skills-dir>/_workflows/`
  - `package.json` — version bump, `files` field update
  - `skills/project-orchestrate/SKILL.md` — major rewrite of Phase 1 Step 3 + multi-spec section
  - `skills/project-scaffold/SKILL.md` — Pass 2 rewrite
  - `skills/project-emulate/SKILL.md` — verification step added
  - `skills/project-cleanup/SKILL.md`, `skills/code-review/SKILL.md` — review gate rewrite
  - `skills/project-spec/SKILL.md` — SpecSchema-validated output

### Workflow Script Contracts

Each workflow script's input, behavior, return shape, and failure modes are specified here. Skills' markdown MUST refer to these contracts when invoking workflows.

#### `sprint_pipeline.js`

**Input args:**

```typescript
{
  stories: Story[],                  // StorySchema-shaped
  epicSlug: string,
  releaseBranch: string,             // e.g., "release/foundation"
  contextMdPath?: string,            // <paths.context>/<epic-slug>/CONTEXT.md
  claudeMdPath?: string,             // project CLAUDE.md
  backendMode: "local" | "github" | "jira" | "trello",
  repoIdentifier?: string,           // owner/repo, github mode only
}
```

**Workflow structure:**

```javascript
phase('Sprint Execution')

const results = await pipeline(
  stories,
  // Stage 1: implement
  story => agent(implementPrompt(story, args), {
    label: `impl:${story.slug}`,
    schema: ImplementationReturn,
  }),
  // Stage 2: review
  (implResult, story) => agent(reviewPrompt(implResult, story), {
    label: `review:${story.slug}`,
    schema: ReviewVerdictSchema,
  }),
  // Stage 3: verify (lightweight verification — does the change actually compile/lint/spot-check?)
  (reviewResult, story, idx) => agent(verifyPrompt(reviewResult, story), {
    label: `verify:${story.slug}`,
    schema: VerifyReturn,
  }),
  // Stage 4: openPR (or local merge)
  (verifyResult, story, idx) => agent(openPRPrompt(verifyResult, story, args), {
    label: `pr:${story.slug}`,
    schema: SprintStoryReturnSchema,
  })
)

return results.filter(Boolean)  // failed pipeline items drop to null
```

**Return:** `SprintStoryReturn[]` (filtered for nulls).

**Failure modes:**

- A story's implement fails → that story drops to `null` and skips later stages.
- A story's review returns `recommendation: "block"` → the workflow still produces the SprintStoryReturn but with `status: "blocked"` and `blockers: [...]`.
- A story's verify fails → same, status blocked.
- A story's openPR fails (e.g., merge conflict) → status blocked with reason.

#### `elaborate_epics.js`

**Input args:**

```typescript
{
  skeleton: {
    project: { name, description, global_preamble, non_functional_requirements: string[] },
    epics: { name, slug, description, slice: { start_line, end_line }, depends_on, shared_design_concerns }[]
  },
  prdPath: string,                   // for slicing
}
```

**Workflow structure:**

```javascript
phase('Pass 2 Elaboration')

const elaborated = await parallel(
  skeleton.epics.map(epic => () =>
    agent(elaboratePrompt(epic, skeleton.project, prdPath), {
      label: `elaborate:${epic.slug}`,
      schema: EpicSchema,  // returns epic with stories[] populated
    })
  )
)

return elaborated.filter(Boolean)  // failed epics drop to null
```

**Return:** `Epic[]` with `stories[]` populated on each.

**Failure modes:**

- An epic's elaboration fails twice (workflow retries once via schema-retry) → returns null. The calling skill (project-scaffold) marks that epic's stories as placeholders with `status: needs-context` per v1.7.0 Pass 2 failure-handling rules.

#### `multi_spec_queue.js`

**Input args:**

```typescript
{
  specs: { path: string, slug: string }[],   // resolved + topo-sorted
  flags: { skipOnPause: boolean, merged: boolean },
  queueStateFilePath: string,                // .claude-scrum-skill/orchestration-queue-state.md
}
```

**Workflow structure:**

```javascript
phase('Sequential Spec Queue')

const summaries = []
for (const spec of specs) {
  // Update queue state to mark this spec in-progress
  await updateQueueState(spec, 'in-progress', queueStateFilePath)

  let result
  try {
    // Each spec invokes a sub-workflow for its full orchestration
    result = await workflow('per_spec_orchestration', { spec, ...args })
  } catch (e) {
    // Safety gate triggered
    if (flags.skipOnPause) {
      await updateQueueState(spec, 'skipped', queueStateFilePath, { reason: e.message })
      summaries.push({ spec, status: 'skipped', reason: e.message })
      continue
    } else {
      await updateQueueState(spec, 'paused', queueStateFilePath, { reason: e.message })
      throw e   // pause the whole queue
    }
  }

  await archiveSpecState(spec.slug)
  await updateQueueState(spec, 'completed', queueStateFilePath, { stats: result.stats })
  summaries.push({ spec, status: 'completed', ...result })
}

return { summaries, aggregateStats }
```

**Note on nested workflows:** The Workflow tool allows `workflow(name, args)` calls one level deep. `multi_spec_queue.js` is the top-level workflow; it invokes `per_spec_orchestration` (an inline-named workflow registered as part of v2.0.0) which itself cannot nest further. Each per-spec workflow handles the full Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup for one spec.

**Failure modes:** Safety-gate pauses propagate as exceptions; `--skip-on-pause` catches them and continues; default re-raises and exits.

#### `adversarial_verify.js`

**Input args:**

```typescript
{
  findings: EmulationFinding[],
  codebaseContext: { projectRoot: string, languages: string[] }
}
```

**Workflow structure:**

```javascript
phase('Verify Findings')

const verified = await parallel(
  findings.map(finding => () => verifyOne(finding))
)

async function verifyOne(finding) {
  // Three agents argue independently
  const [claim, skeptic] = await parallel([
    () => agent(claimantPrompt(finding), { schema: EvidenceSchema, label: `claim:${finding.id}` }),
    () => agent(skepticPrompt(finding), { schema: EvidenceSchema, label: `skeptic:${finding.id}` })
  ])
  if (!claim || !skeptic) return null

  const judge = await agent(judgePrompt(finding, claim, skeptic), {
    schema: VerdictSchema,
    label: `judge:${finding.id}`
  })

  return { finding, claim, skeptic, verdict: judge }
}

return verified.filter(Boolean)
```

**Return:** Array of verified findings, each with `{ finding, claim, skeptic, verdict: { isReal, confidence, rationale } }`.

#### `review_panel.js`

**Input args:**

```typescript
{
  diff: string,
  files: { path: string, contents: string }[],
  lenses: ("correctness" | "security" | "style" | "tests")[]
}
```

**Workflow structure:**

```javascript
phase('Multi-Lens Review')

const perLens = await parallel(
  lenses.map(lens => () =>
    agent(reviewPrompt(diff, files, lens), {
      schema: ReviewVerdictSchema,
      label: `review:${lens}`
    })
  )
)

phase('Aggregate Verdict')

const aggregated = aggregate(perLens.filter(Boolean))
// aggregated: { recommendation: "block" | "accept-with-followups" | "accept",
//               critical_count, warning_count, info_count, perLensVerdicts }

return aggregated
```

**Aggregation rule:** If any lens returns `recommendation: "block"`, panel verdict is `block`. Else if any returns `accept-with-followups`, panel verdict is `accept-with-followups`. Else `accept`. Findings are union'd across lenses with severity preserved.

### Path Resolution Algorithm (for Workflow Script Lookup)

When a skill markdown directs the executing agent to invoke a workflow, the agent computes the workflow script path as follows:

1. Identify the absolute path of the currently-loaded `SKILL.md` (e.g., `/Users/x/.claude/skills/project-orchestrate/SKILL.md` or `<plugin-install-path>/skills/project-orchestrate/SKILL.md`).
2. Walk up one directory (the parent of `SKILL.md` is the skill directory; the parent of that is the skills root).
3. From the skills root, descend into `_workflows/`.
4. Append the workflow script filename: `_workflows/sprint_pipeline.js`.
5. The resulting absolute path is the `scriptPath` argument to the Workflow tool.

Example:

- SKILL.md at `/Users/x/.claude/skills/project-orchestrate/SKILL.md`
- Skill dir: `/Users/x/.claude/skills/project-orchestrate/`
- Skills root: `/Users/x/.claude/skills/`
- Workflow script: `/Users/x/.claude/skills/_workflows/sprint_pipeline.js`

This algorithm works for global install (`~/.claude/skills/`), local install (`<project>/.claude/skills/`), and plugin install (`<plugin-install-path>/skills/`) without modification.

## User Experience

### What users see

Identical to v1.8.1. The slash commands, the prompts, the announcements ("Starting Spec 1/3 — spec-a.md", "Sprint 2: 5/8 stories done"), the state files, the cumulative summary, the ADR generation — all unchanged.

### What contributors see (new)

A new layer under `lib/workflows/` with five workflow scripts and a schemas subdirectory. Contributors adding a new skill that needs fan-out can add a new workflow script and reference it from the skill markdown.

### What plugin install users see

Identical to v1.8.1 (still namespaced as `@houseofwolvesllc/project-orchestrate`). The plugin install copies the same `lib/workflows/` directory into the plugin's install location; path resolution works identically.

### What v1.8.x users see when upgrading

A migration banner in the CHANGELOG `[2.0.0]` entry explaining:

- No user-facing change for orchestration invocations.
- Requires Claude Code with the Workflow tool. v1.8.x remains supported for older Claude Code installs (`npm install --save-dev @houseofwolvesllc/claude-scrum-skill@1.8.1`).
- Plugin/extension authors who hooked into the deleted Task-spawning prose sections in `/project-orchestrate` Phase 1 Step 3 must update.

## Architecture

### Layered Model (the ADR-0003 thesis)

```
                    ┌────────────────────────────────────────┐
                    │  User                                  │
                    │  (types /project-orchestrate spec.md)  │
                    └─────────────────┬──────────────────────┘
                                      │
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  Skill markdown (the opinion)          │
                    │  - Defines WHAT and WHY                │
                    │  - Owns durable artifacts              │
                    │    (state files, ADRs, CONTEXT.md)     │
                    │  - Sequential phase structure          │
                    │  - Stored at ~/.claude/skills/         │
                    └─────────────────┬──────────────────────┘
                                      │ invokes
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  Workflow scripts (the substrate)      │
                    │  - JavaScript at lib/workflows/        │
                    │  - Express HOW to fan out              │
                    │  - Schema-validated returns            │
                    │  - Journal-based resume                │
                    │  - Concurrency 16                      │
                    │  - Installed at ~/.claude/skills/      │
                    │    _workflows/                         │
                    └─────────────────┬──────────────────────┘
                                      │ spawns
                                      ▼
                    ┌────────────────────────────────────────┐
                    │  Agents (the workers)                  │
                    │  - Implement stories, review diffs,    │
                    │    verify findings, etc.               │
                    │  - Receive prompts from workflows      │
                    │  - Return schema-validated data        │
                    └────────────────────────────────────────┘
```

### Component Diagram

```
              npm package (v2.0.0)
              ├── package.json
              ├── bin/install.js ──────────► postinstall copies
              ├── skills/                          │
              │   ├── project-orchestrate/        │   to ~/.claude/skills/
              │   ├── project-scaffold/           │
              │   ├── project-emulate/            ▼
              │   ├── project-cleanup/      ~/.claude/skills/
              │   ├── project-spec/         ├── project-orchestrate/SKILL.md
              │   ├── project-spec/         ├── project-scaffold/SKILL.md
              │   ├── sprint-plan/          ├── ...
              │   ├── sprint-release/       ├── shared/
              │   ├── sprint-status/        └── _workflows/         ◄── new
              │   ├── code-review/              ├── sprint_pipeline.js
              │   └── shared/                   ├── elaborate_epics.js
              └── lib/                          ├── multi_spec_queue.js
                  └── workflows/                ├── adversarial_verify.js
                      ├── sprint_pipeline.js    ├── review_panel.js
                      ├── elaborate_epics.js    └── schemas/
                      ├── multi_spec_queue.js       ├── SpecSchema.json
                      ├── adversarial_verify.js     ├── EpicSchema.json
                      ├── review_panel.js           └── ...
                      └── schemas/
                          ├── SpecSchema.json
                          ├── EpicSchema.json
                          └── ...
```

### Data Flow Example: Sprint Execution

1. User invokes `/project-orchestrate spec.md`.
2. Skill markdown enters Phase 1, calls `/project-scaffold spec.md` to build the backlog.
3. Skill markdown enters Step 2 (sprint planning), calls `/sprint-plan`, populates sprint stories.
4. Skill markdown enters Phase 1 Step 3 (sprint execution). Markdown reads (in the executing agent's context):

   > Invoke the sprint pipeline workflow. Resolve `scriptPath` per the Path Resolution Algorithm: `<skills-root>/_workflows/sprint_pipeline.js`. Pass these args: `{ stories, epicSlug, releaseBranch, contextMdPath, claudeMdPath, backendMode, repoIdentifier }`. Wait for the workflow to return. The return value is `SprintStoryReturn[]`. For each entry: if `status === "done"`, update the story file's frontmatter to `status: done` and record the PR URL or merge SHA in the state file's "Current Sprint Stories" table. If `status === "blocked"`, record the blockers in the state file and continue.

5. Executing agent invokes the Workflow tool with `scriptPath` and `args`.
6. Workflow runs: spawns up to 16 concurrent agents across the pipeline stages, journaling progress.
7. Workflow returns the `SprintStoryReturn[]` array (schema-validated).
8. Executing agent persists results to state file, story frontmatter, and continues to Step 4 (Sprint Release).

### Integration Points

- **State files**: Workflows write to `orchestration-state.md` and `orchestration-queue-state.md` via their agents' Bash/Write tool access. The format is the v1.8.x markdown format; workflows produce structured updates and append-only log entries.
- **Story files**: After workflows return, the calling skill updates each story file's `status` frontmatter. Workflows themselves don't update story files (separation of concerns: workflows return data; skills persist).
- **ADRs / CONTEXT.md**: Workflows produce design-spike artifacts (CONTEXT.md per epic, ADR for the foundational architecture). These are written by `elaborate_epics.js` and the design-spike sub-workflow.
- **CHANGELOG / package.json**: Unchanged by workflows; only the documentation-release sprint of THIS implementation updates them.

### System Boundaries

- The npm package is the unit of distribution.
- Inside the package, `skills/` (markdown) and `lib/workflows/` (JS) are coordinated but distinct modules.
- The Workflow tool is an external dependency provided by the Claude Code runtime.
- Backends (local, GitHub, Jira, Trello) remain external integrations; workflows invoke `gh`/`curl`/filesystem via their agents' tool access.

## Implementation Plan

The work is naturally divided into five phases. Sprints align with phase boundaries; some phases have multiple stories that can run in parallel because they touch distinct files.

### Phase 1 — Foundation (5 stories)

1. **Add `lib/workflows/` directory structure** with empty stub files for each workflow (so subsequent stories can write them in place without merge conflicts).
2. **Create `lib/workflows/schemas/` and author all 8 JSON Schema files** (SpecSchema, EpicSchema, StorySchema, EmulationFindingSchema, ReviewVerdictSchema, SprintStoryReturnSchema, ScaffoldOutputSchema, PRDFrontmatterSchema). All schemas are JSON Schema Draft 2020-12. This is one focused story producing all schemas to ensure cross-schema references (e.g., Epic has Story[]) are consistent.
3. **Update `bin/install.js`** to copy `lib/workflows/` to `<install-dir>/_workflows/`. Verify both global and local install paths work.
4. **Update `package.json`** `files` field to include `lib/`. Verify `npm pack --dry-run` includes the workflows.
5. **Add "Architecture" section to README** documenting the lib/workflows layer for contributors. Also add the v2.0.0-requires-Workflow callout near the top of Installation.

### Phase 2 — Workflow Scripts (5 stories, mostly parallel)

6. **Author `lib/workflows/sprint_pipeline.js`** per the contract in Technical Specifications. Includes prompt-construction helpers for each stage.
7. **Author `lib/workflows/elaborate_epics.js`** per the contract.
8. **Author `lib/workflows/multi_spec_queue.js`** per the contract. Note the one-level-nesting constraint: this workflow invokes `workflow(per_spec_orchestration, args)` once per spec.
9. **Author `lib/workflows/adversarial_verify.js`** per the contract.
10. **Author `lib/workflows/review_panel.js`** per the contract.

### Phase 3 — Skill Rewrites (5 stories, mostly parallel; each touches a different SKILL.md)

11. **Rewrite `/project-orchestrate/SKILL.md` Phase 1 Step 3 (Story Execution) and Sequential Multi-Path Mode**. Delete the Task-spawning prose. Replace with workflow invocation directives per FR-21, FR-22. Include the Path Resolution Algorithm reference. Add the Workflow-availability check to Before You Start.
12. **Rewrite `/project-scaffold/SKILL.md` Two-Pass Procedure Pass 2**. Delete the Pass 2 Task-spawning prose. Replace with `elaborate_epics.js` invocation directives per FR-23.
13. **Update `/project-emulate/SKILL.md`** to add a Verification step (post-findings) invoking `adversarial_verify.js` per FR-24.
14. **Update `/project-cleanup/SKILL.md` and `/code-review/SKILL.md`** to invoke `review_panel.js` for the review gate per FR-25.
15. **Update `/project-spec/SKILL.md`** to produce SpecSchema-validated structured output alongside the markdown spec per FR-26. Sibling JSON file at `<specs-path>/<timestamp>_<name>.spec.json`.

### Phase 4 — Release (3 stories)

16. **Create ADR-0003** at `docs/adrs/0003-workflow-backed-re-plumbing.md` documenting the architectural shift, the layered model, and the rationale. References the source spec and the synthesis that produced it.
17. **Bump `package.json` to 2.0.0** and add `[2.0.0]` CHANGELOG entry under Keep a Changelog format with Added / Changed / Removed / Migration sections.
18. **Update README user-facing sections** to mention the v2.0.0 Workflow-tool requirement, the v1.8.x fallback path, and (in the existing Autonomous Orchestration section) the fact that internal execution now uses workflows. Plus the contributor-facing Architecture section if not added in Phase 1.

### Phase 5 — Verification Fixtures (2 stories)

19. **Update existing fixtures** at `docs/specs/_fixtures/` to remain useful: small_prd.md (single-pass path still works), large_prd.md (two-pass path now invokes `elaborate_epics.js`).
20. **Add a new fixture** at `docs/specs/_fixtures/workflow_invocation_check.md` — a minimal PRD whose orchestration exercises every workflow script at least once (sprint_pipeline, elaborate_epics, adversarial_verify, review_panel). Used to verify v2.0.0 end-to-end post-merge.

## Testing Strategy

The skill suite has no automated test framework. Verification is observational against the fixtures, run by hand or by a future verification harness.

### Verification Fixtures

Existing fixtures at `docs/specs/_fixtures/` continue to apply:

- `small_prd.md` — single-pass, no design-spike. Verifies the single-spec path still produces identical artifacts and state files vs v1.8.1.
- `large_prd.md` — two-pass + design-spike. Verifies Pass 2 now invokes `elaborate_epics.js` and produces identical structure.

New fixture:

- `workflow_invocation_check.md` — minimal PRD designed so its full orchestration touches each workflow script at least once. Used as the v2.0.0 smoke test.

### Verification Matrix

| # | Case | Input | Expected |
|---|------|-------|----------|
| 1 | Workflow tool present, single-spec orchestration | `/project-orchestrate small_prd.md` | Identical artifacts to v1.8.1: state file, ADR, CONTEXT.md, scaffolded backlog, sprint commits. Sprint execution log shows `sprint_pipeline.js` was invoked. |
| 2 | Workflow tool present, multi-spec orchestration | `/project-orchestrate small_prd.md another_small.md` | Identical artifacts to v1.8.1 multi-spec mode. `multi_spec_queue.js` was invoked. Queue state file matches v1.8.1 format. |
| 3 | Workflow tool present, large PRD with two-pass + design-spike | `/project-orchestrate large_prd.md` | Two-pass triggers; `elaborate_epics.js` invoked; design-spike epic auto-injected; per-epic CONTEXT.md files produced. |
| 4 | Workflow tool absent | Invoke any v2.0.0 skill in a Claude Code session without Workflow | Skill's Before You Start check fires; skill aborts with a clear message pointing to v1.8.x. |
| 5 | Path resolution — local install | Run v2.0.0 against a project with `.claude/skills/` locally | Workflow script path resolves to `<project>/.claude/skills/_workflows/sprint_pipeline.js`. Workflows execute. |
| 6 | Path resolution — global install | Run v2.0.0 against any project with `~/.claude/skills/` populated globally | Workflow script path resolves to `~/.claude/skills/_workflows/sprint_pipeline.js`. Workflows execute. |
| 7 | Path resolution — plugin install | Install v2.0.0 via `/plugin install`; invoke a skill | Workflow script path resolves to the plugin's install location. Workflows execute. |
| 8 | Cross-session resume | Start orchestration, pause mid-sprint by closing the session, reopen and re-invoke | Skill reads state file, invokes sprint pipeline with remaining stories, resumes correctly. Workflow's in-session journal is gone (session ended) but state-file-driven resume works. |
| 9 | Performance — 10-story sprint | Run a synthetic 10-story sprint on v1.8.1 and v2.0.0 sequentially | v2.0.0 wall-clock ≤ 0.5× v1.8.1's. (Concurrency 3 → 16 + barrier removal.) |
| 10 | Schema validation failure | Craft a fixture where `elaborate_epics.js` returns malformed Epic shape | Workflow retries once (schema-retry); if persistent, returns null for that epic; calling skill marks epic's stories `needs-context`. |
| 11 | Adversarial verify on real finding | Run `/project-emulate` on a project with a known real bug | adversarial_verify.js returns verdict.isReal: true with claimant evidence corroborated. |
| 12 | Adversarial verify on false positive | Run `/project-emulate` on a project with a deliberately seeded false positive | verdict.isReal: false, skeptic evidence shown. |
| 13 | Review panel | Run `/project-cleanup` on a diff with deliberate security issue | review_panel.js per-lens verdicts: security lens flags critical; correctness lens may pass; aggregated verdict: block. |
| 14 | State file backward compatibility | Run v2.0.0 against an existing v1.8.x state file | State file is read correctly; orchestration resumes from the recorded position. No format migration needed. |
| 15 | npm install --save-dev | `npm install --save-dev @houseofwolvesllc/claude-scrum-skill@2.0.0` | Postinstall succeeds. `lib/workflows/` is copied to `<project>/.claude/skills/_workflows/`. |

### Behavioral Verification Post-Merge

1. Smoke-test cases 1-3 against the fixtures.
2. Run a real (non-fixture) orchestration on a small project and confirm artifacts match expectations.
3. Manually inspect a workflow run's transcript directory to confirm structured progress, schema'd returns, and clean failure modes.

## Future Considerations

### Potential Extensions

- **Per-lens reviewer customization.** Currently `review_panel.js` has hard-coded lenses (correctness, security, style, tests). A future enhancement could let users add custom lenses via config (e.g., `lenses: ["correctness", "security", "accessibility"]`).
- **Workflow-native ADR generation.** ADR-0003 documents the v2.0.0 shift. A workflow for ADR generation (`adr_synthesize.js`) could replace Step 16's prose with a structured agent that reads completed sprints, scores significance, and emits a ranked list of ADRs to author. Out of scope for v2.0.0.
- **`/sprint-plan` workflow.** v2.0.0 leaves `/sprint-plan` untouched because it has no significant fan-out. If sprint planning grows complex (e.g., velocity-aware story selection, dependency-graph optimization), it becomes a candidate for a `sprint_plan.js` workflow.
- **Parallel multi-spec.** v1.8.0 introduced sequential multi-spec. A `--parallel` flag with a parallel queue workflow is a natural extension once sequential is proven stable. Out of scope for v2.0.0.
- **Workflow-aware state file format.** v2.0.0 keeps the v1.8.x markdown state file. A future version could switch to a JSON state file with a richer structure (workflow run IDs, per-story timings, retry history). Markdown stays as the human-readable view.
- **Inline schemas in skill markdown.** Today schemas live in `lib/workflows/schemas/` and are referenced by workflows. A future enhancement could make the skill markdown also reference schemas directly for prompt construction (e.g., "this story file's frontmatter conforms to StorySchema"). Out of scope.

### Scalability Considerations

- **Workflow concurrency cap is 16.** Beyond ~16 parallel stories, additional stories queue. For sprints with 30+ stories this is acceptable (one queue cycle ≈ 2-3 minutes of fan-out work). At 100+ stories, the cap may be a real limit; future work could introduce hierarchical workflows (top-level workflow fans out 16 chunks, each chunk runs its own sprint sub-workflow with 16 concurrent agents).
- **Total agent count per workflow is 1000.** This is well beyond any practical sprint. No concern.
- **Schema validation overhead is negligible.** JSON Schema validation is microseconds per agent return.

### Long-term Maintenance Notes

- Workflows are JavaScript and require occasional updates as the Workflow tool evolves. Pin to a known-good Workflow API surface in the workflow scripts (use only documented `agent()`, `parallel()`, `pipeline()`, `workflow()` primitives). Avoid undocumented internals.
- Schemas in `lib/workflows/schemas/` are the canonical cross-skill type system. Updates to schemas are breaking changes (downstream skills depend on them); bump major version when changing schemas.
- The `_workflows/` install location is conventional (leading underscore prevents Claude Code from registering it as a skill). If Claude Code's skill discovery rules change, this convention may need revisiting.
- v1.8.x remains available on npm indefinitely. Users on older Claude Code without Workflow can stay on 1.8.x; the major bump signals the runtime requirement, not a code abandonment.
- The Workflow tool's `workflow()` one-level-nesting constraint is load-bearing for `multi_spec_queue.js`. If the constraint relaxes in a future Workflow tool version, the multi-spec wrapper can become simpler (each per-spec phase a nested workflow). If the constraint tightens further, the design needs revisiting.
