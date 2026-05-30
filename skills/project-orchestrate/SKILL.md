---
name: project-orchestrate
description: Autonomous project lifecycle driver that ties together all skills into a continuous loop — plan sprints, execute stories in parallel, release, merge, clean up, and repeat until all epics are done, then run emulation hardening loops until the codebase is clean. Use when you want Claude to drive the entire project from backlog to production-ready without manual skill invocation at each step.
---

# Project Orchestrate

Fully autonomous project lifecycle driver. Plans sprints, executes stories via parallel subagents, releases, merges to development, cleans up branches, and repeats until every epic is complete — then hardens the codebase through emulation-driven fix cycles until no issues remain.

---

## Before You Start

0. **v2.0.0 runtime check.** Confirm the Claude Code **Workflow tool** is available in this session. v2.0.0 invokes workflow scripts at `<skills-root>/_workflows/*.js` for sprint execution, Pass 2 epic elaboration, multi-spec queueing, emulation finding verification, and the review gate. If the Workflow tool is absent, abort with: "v2.0.0 requires the Claude Code Workflow tool. Update Claude Code, or install the v1.8.x fallback (`npm install --save-dev @houseofwolvesllc/claude-scrum-skill@1.8.1`)." Do not proceed.
1. Read `../shared/references/CONVENTIONS.md` for all project management standards. Follow these conventions exactly. Pay particular attention to **Epic Structure → Design-Spike Epic** — orchestration honors the design-spike epic's gating, so implementation work in a scoped run does not begin until the design-spike epic completes. Also note **Frontmatter Fields → PRD Document Frontmatter** — the `depends_on` field controls inter-spec execution order in sequential multi-path mode.
1a. **Multi-path mode and new flags:** when invoked with 2+ existing-file paths, `/project-orchestrate` runs in sequential multi-path mode (each spec receives its own complete orchestration end-to-end). Two new flags are accepted: `--skip-on-pause` (default off; advance the queue when a spec hits a safety gate instead of pausing) and `--merged` (default off; treat multi-path inputs as one combined legacy multi-spec project with a deprecation warning). See **Input Parsing and Mode Detection** for the full classification and **Sequential Multi-Path Mode** for execution details.
2. Read `../shared/config.json` to determine the scaffolding mode (`scaffolding` key: `"local"`, `"github"`, `"jira"`, or `"trello"`, default: `"local"`). If `"local"`, also read the `paths.backlog` and `paths.context` values (`paths.context` defaults to `.claude-scrum-skill/context` and is where Step 3 subagents look for per-epic CONTEXT.md files). Read `../shared/references/PROVIDERS.md` for provider-specific API commands when using a remote provider.
3. Read the project's `CLAUDE.md` (if it exists) for project-specific rules. **All subagents you spawn must also read and follow `CLAUDE.md`** — include this instruction explicitly in every subagent prompt.
4. Read `../shared/references/PERSONAS.md` for role preambles. When spawning
   subagents, select the persona matching each story's `persona:*` label (GitHub mode)
   or `persona` frontmatter field (local mode). If no persona exists, use `impl` (the default).
5. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in GitHub API commands and code — never in communication with the user.
6. **If `scaffolding: "github"`:** Confirm the `gh` CLI is authenticated by running `gh auth status`. Identify the target repository. If the user doesn't specify, detect from the current git remote or ask.
7. **If `scaffolding: "jira"`:** Verify `JIRA_SITE`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` env vars are set. Read `jira.project_key` from config.json.
8. **If `scaffolding: "trello"`:** Verify `TRELLO_API_KEY` and `TRELLO_TOKEN` env vars are set. Read `trello.board_id` from config.json.
9. **If `scaffolding: "local"`:** Skip authentication. Stories are tracked in local backlog files. Git operations (branches, commits, merges) still apply.

### Standing Authorizations

The following actions are pre-authorized and do NOT require user confirmation during orchestration:

- **Merge release branches to `development`** — via PR (GitHub) or direct merge (local), after CI passes
- **Delete merged story and release branches** — standard cleanup after merge
- **Create and switch between feature/release branches** — normal git workflow
- **Update story file frontmatter** (local mode only) — status, sprint, persona fields

The following actions are NEVER authorized:

- **Merge anything to `main`** — always requires explicit human review
- **Force push or destructive git operations** — never permitted
- **Close or delete issues/stories without completing them** — incomplete work rolls over

---

## Default Operating Mode

Run autonomously on invocation. Standing Authorizations cover the normal lifecycle — proceed under them without asking.

**No pre-flight audits.** Don't list concerns and present a menu of options before starting. Pick the spec's literal intent and go. Surface defects in execution output as you encounter them, not as pre-execution gates. Asking "which option do you want?" before executing is itself a violation of autonomous mode.

**Phase 2 (Emulation) and Phase 3 (Cleanup) always run.** Mandatory on every orchestration regardless of how small or clean the Phase 1 change set looks. For projects with no traditional toolchain (e.g., a markdown-only repo), Phase 3 reports SKIP/PASS — that is the correct outcome, not a reason to omit the phase.

**State file is automatic.** `Status: running` or `paused` → resume from the recorded position. `Status: completed` → rename to `orchestration-state.previous.md` and start a fresh run. Missing → initialize a new file. Never prompt.

**Scaffolding decisions fire per their own trigger logic.** Two-pass mode and design-spike epic injection live in `project-scaffold/SKILL.md` (Mode Detection, Design-Spike Epic). The orchestrator does NOT add a separate confirmation prompt on top of those triggers.

**Pause only on four real safety issues:** unresolvable merge conflict (Step 5c, Error Handling → Merge Conflicts); critical review/emulation finding (Step 5b, `block`/`revert` recommendation); 3rd consecutive hardening run still dirty (Step 13 safety valve); rate-limit exhaustion (Error Handling → Rate Limiting). Nothing else.

**Per-invocation overrides are honored** when the user explicitly asks for interactive mode for the current run ("pause between phases", "let me approve each sprint", etc.). The default remains autonomous.

---

## Input

`$ARGUMENTS` can be:

1. **A PRD file path** (e.g., `path/to/prd.md`) — scaffold the PRD first via `/project-scaffold`, then orchestrate **only the epics and stories created from that PRD**. In GitHub mode the repo is detected from the current git remote (or ask the user).
2. **A repo identifier** (e.g., `owner/repo`, GitHub mode only) — orchestrate **all open epics and stories** already on the project board. No scaffolding step.
3. **A PRD file path + repo identifier** (e.g., `path/to/prd.md owner/repo`, GitHub mode only) — scaffold the PRD into the specified repo, then orchestrate only those epics/stories.
4. **Nothing** — GitHub mode: detect the repo from the current git remote and orchestrate all open epics/stories. Local mode: orchestrate all open epics/stories in the configured backlog directory.
5. **Multiple PRD paths** (e.g., `spec-1.md spec-2.md spec-3.md`) — sequential per-spec orchestration. Each spec receives its own complete orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) end-to-end before the next begins. See **Input Parsing and Mode Detection** below.

### Scope Rules

- **Phase 1 (Epic Completion Loop):** When a PRD is provided, only execute epics/stories that were created from that PRD. In GitHub mode, record the milestone numbers and issue numbers. In local mode, record the epic directory names and story file paths. When no PRD is provided, execute all open epics/stories.
- **Phase 2 (Emulation Hardening Loop):** Always applies to the **entire codebase** regardless of whether a PRD was provided. Emulation validates the whole project, not just the new work.

---

## Input Parsing and Mode Detection

Before any orchestration work begins, classify the invocation into one of the modes below and announce the decision. The classification depends on how many tokens are in `$ARGUMENTS` and how many of them resolve to existing files on disk.

### Mode Classification

**Pre-classification step:** Before applying the table below, separate **flag tokens** (those starting with `--`, e.g., `--skip-on-pause`, `--merged`) from **argument tokens**. Count and classify only the argument tokens. Flags are validated and consumed separately by the Flag Parsing subsection below; they do not contribute to the token count or the file/non-file determination.

Apply these rules in order; the first match wins.

| Argument token count | All resolve to files? | Mixed? | Mode |
|----------------------|----------------------|--------|------|
| 0 | — | — | **No-arg mode** (existing v1.7.1) — orchestrate open epics in the backlog. |
| 1 | yes | — | **Single-spec mode** (existing v1.7.1) — scaffold + orchestrate this one PRD. |
| 1 | no | — | **Repo-identifier mode** (existing v1.7.1, GitHub only) — orchestrate the repo's open epics. |
| Exactly 2 | exactly one is a file, the other is not | — | **Single-spec + repo mode** (existing v1.7.1, GitHub only) — scaffold the PRD into the named repo, orchestrate only that PRD's epics. |
| 2+ | yes (all tokens are paths to existing files) | — | **Sequential multi-path mode** (new) — see "Sequential Multi-Path Mode" section. |
| 2+ | no (all tokens are non-files) | — | **ERROR.** Multi-repo invocation is unsupported. Abort with a message listing the repo identifiers offered and noting that exactly one repo identifier is permitted per invocation. |
| 2+ | mixed (some files, some non-files, AND not the exactly-2 single-spec+repo case above) | yes | **ERROR.** Abort with a clear message listing which tokens are paths and which are not. Mixed argument lists outside the single-spec+repo shape are unsupported. |

### Flag Parsing

`/project-orchestrate` accepts the following flags. They may appear in any position within `$ARGUMENTS`:

- **`--skip-on-pause`** (default off) — in sequential multi-path mode, a spec whose orchestration pauses on a safety gate is marked `skipped`, its in-progress state file is archived with `.skipped.md` suffix, and the queue advances to the next spec. Without this flag (the default), the queue pauses and waits for the user to resolve the gate before re-invocation.
- **`--merged`** (default off) — when set with 2+ PRD paths, treat the inputs as one combined multi-spec project using legacy best-effort behavior. Emits a deprecation warning that formal merged semantics are not yet specified. Prefer the sequential default unless merged behavior is explicitly required.

The flags are orthogonal: pass either, both, or neither.

Unknown flags or invalid flag values MUST cause the skill to abort with an error BEFORE starting any orchestration work. Example: `--mode=fast` is unknown; abort and list the supported flags.

### Glob Expansion

Modern shells expand globs (e.g., `docs/specs/*.md`) before passing to Claude Code, so the skill typically sees pre-expanded paths. If `$ARGUMENTS` arrives with literal glob characters (`*`, `?`, `[...]`) still present, the skill MUST expand the glob itself BEFORE applying mode classification.

### Announcement (Mandatory)

Before any orchestration work begins, announce the chosen mode and the count of specs (for multi-path) so the user understands what's about to happen:

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

For single-spec, repo-identifier, or no-arg modes, the announcement is the existing v1.7.1 startup summary; no new format required.

### Routing

- **Sequential multi-path mode** → run Dependency Resolution (next subsection), then invoke the per-spec wrapper documented in **Sequential Multi-Path Mode**.
- **Merged mode** (with `--merged`) → see **Sequential Multi-Path Mode → Merged Mode (Opt-In)**.
- **All other modes** → continue with the existing State Management and Phase 1 sections unchanged.

### Dependency Resolution

Applies only to sequential multi-path mode (and merged mode if dependencies need to inform internal ordering). Runs after Mode Classification but BEFORE any spec executes.

#### `depends_on` Frontmatter

Each PRD/spec MAY declare an optional `depends_on` field in its YAML frontmatter. The value is a YAML list of paths or basenames. See `CONVENTIONS.md` → Frontmatter Fields → PRD Document Frontmatter for the full convention.

```yaml
---
title: My Spec
depends_on:
  - other-spec.md            # basename match against other args
  - subdir/another-spec.md   # path match relative to this spec's directory
---
```

#### Path Resolution

For each entry in a spec's `depends_on` list:

1. Try interpreting the entry as a path relative to the declaring spec's own directory. If it canonicalizes to one of the specs in the current invocation's argument list (compared by canonical absolute path), the dependency resolves.
2. If step 1 fails, try interpreting the entry as a basename match against the basenames (filename without directory) of the argument-list specs. If exactly one spec in the list has a matching basename, the dependency resolves.
3. If neither step 1 nor step 2 resolves to a spec in the current invocation's argument list, ABORT the run with a clear error message naming the unresolved entry. Do NOT start any spec. Silent ignoring of unresolved dependencies would lead to subtle wrong-order execution.

#### Dependency Graph Construction

After resolving every spec's `depends_on` entries, build a directed acyclic graph (DAG):

- Nodes: each spec in the argument list.
- Edges: from depended-upon spec → dependent spec. (If spec-B has `depends_on: [spec-A.md]`, the edge is `spec-A → spec-B`, meaning A must complete before B.)

#### Cycle Detection

Detect cycles using the standard algorithm (e.g., DFS with a visiting-set). A cycle includes:

- Two-node cycles: `A → B → A`.
- Longer cycles: `A → B → C → A`.
- Self-loops: a spec declaring `depends_on: [itself.md]`.

If any cycle is detected, ABORT with the following error format BEFORE starting any spec:

```
ERROR: Dependency cycle detected. No specs were started.

Cycle members:
  spec-a.md → depends_on: spec-b.md
  spec-b.md → depends_on: spec-a.md

Resolve the cycle (remove one of the declarations) and re-run.
```

#### Missing-Dependency Detection

If any `depends_on` entry references a path that does not appear in the current invocation's argument list (after path resolution per the rules above), ABORT with the following error format BEFORE starting any spec:

```
ERROR: Dependency not in argument list. No specs were started.

Missing dependency:
  spec-b.md declares depends_on: [spec-a.md]
  spec-a.md is not present in this invocation.

Either add spec-a.md to the invocation, or remove the depends_on declaration in spec-b.md.
```

#### Topological Sort with Stable Tie-Break

Once the graph passes cycle and missing-dependency checks, topologically sort the specs. Tie-break: when two specs have no dependency relationship between them, the one appearing earlier in the original `$ARGUMENTS` order executes first. The sort MUST be stable.

#### No-`depends_on` Fallback

If NO spec declares `depends_on`, execution order is simply the order tokens appear in `$ARGUMENTS`. No graph construction or topological sort is performed (or, equivalently, an empty graph topo-sorts to the input order).

#### Pre-Execution Validation Order

All validation runs BEFORE any spec's orchestration begins (NFR-3):

1. Mixed-argument detection (per Mode Classification).
2. Flag validation (unknown flags abort).
3. Glob expansion (if needed).
4. `depends_on` parsing and path resolution.
5. Cycle detection.
6. Missing-dependency detection.
7. Topological sort.

Only after all of these pass does the per-spec wrapper start invoking the per-spec orchestration.

---

## State Management

Orchestration state is persisted to `.claude-scrum-skill/orchestration-state.md` so progress survives context compaction, usage caps, and session restarts. This file is human-readable markdown.

### State File Structure

```markdown
# Orchestration State

## Meta
- **Repo:** owner/repo
- **Project:** #<number>
- **Phase:** epic-completion | emulation-hardening | project-cleanup
- **Status:** running | paused | completed
- **Scope:** prd | all
- **PRD Source:** path/to/prd.md (if scope=prd, otherwise "—")
- **Scoped Milestones:** #1, #3 (if scope=prd — only these epics are orchestrated in Phase 1)
- **Scoped Issues:** #10, #11, #12, ... (if scope=prd — only these stories are orchestrated in Phase 1)
- **Started:** <ISO timestamp>
- **Last Updated:** <ISO timestamp>

## Current Position
- **Current Epic:** <epic name> (milestone #<number>)
- **Current Sprint:** <N>
- **Hardening Run:** <N> (Phase 2 only)

## Epic Progress
| Epic | Status | Open | Closed | Total |
|------|--------|------|--------|-------|
| Core API | in-progress | 4 | 12 | 16 |
| Dashboard | pending | 8 | 0 | 8 |

## Current Sprint Stories
| # | Title | Executor | Persona | Status | Subagent |
|---|-------|----------|---------|--------|----------|
| 12 | Auth endpoint | claude | impl | done | — |
| 13 | Login UI | claude | impl | in-progress | agent-3 |
| 14 | API keys | human | — | skipped | — |
| 15 | CI pipeline | claude | ops | done | — |
| 16 | Auth ADR | claude | research | done | — |

## Dependency Map
- #15 blocked-by #12 → unblocked (completed)
- #18 blocked-by #15 → waiting

## Log
- [<timestamp>] Phase 1 started — 3 open epics detected
- [<timestamp>] Sprint 1 planned — 8 stories, 19 points
- [<timestamp>] Story #12 completed by subagent
- [<timestamp>] Sprint 1 released — PR #25
```

### State Operations

**On startup**, check for an existing `.claude-scrum-skill/orchestration-state.md`. The autonomous default handles all four cases without prompting the user — see Default Operating Mode → State file handling for the full decision table. Briefly:

- `Status: running` → resume from the recorded position.
- `Status: paused` → resume from the recorded position (the pause cause should already be addressed; if not, the run will pause again on the same issue).
- `Status: completed` → rename to `orchestration-state.previous.md` and start fresh.
- No file → initialize a new state file.

**During execution**, update the state file:
- After every sprint plan, story completion, release, and phase transition
- On any error that pauses execution
- Keep the log section as an append-only journal (trim entries older than the current phase to prevent unbounded growth)

**On completion**, set `Status: completed` and write a final summary to the log.

---

## Phase 1 — Epic Completion Loop

Drive all open epics to completion through iterative sprint cycles.

### Step 1: Initialize

**If a PRD was provided** — scaffold it first, then scope the run:

```
/project-scaffold <prd-path>
```

After scaffolding completes:
- **GitHub mode:** Capture the milestone numbers and issue numbers that were created. Record them in the state file under `Scoped Milestones` and `Scoped Issues`.
- **Local mode:** Capture the epic directory names and story file paths created. Record them in the state file under `Scoped Epics` and `Scoped Stories`.

These define the **orchestration scope** — Phase 1 will only plan and execute sprints for these specific epics and stories.

**If no PRD was provided** — detect and assess the existing project state:

**GitHub mode:**
```bash
# Get open epics (milestones)
gh api repos/<owner/repo>/milestones --jq '.[] | select(.state=="open") | {number, title, open_issues, closed_issues}'

# Get backlog overview
gh issue list --repo <owner/repo> --state open --label "type:story" --json number,title,labels,milestone

# Get current sprint iteration info via GraphQL
# Check for any in-progress work
```

**Local mode:**
```bash
# Read all epic directories with open status
# For each <backlog-path>/<epic-slug>/_epic.md, check frontmatter status
# Read all story files, filter by status != "done"
```

All open epics and stories are in scope for Phase 1.

**In both cases**, present a brief overview to the user:

```
## Orchestration Overview

**Repo:** owner/repo
**Scope:** PRD-scoped (path/to/prd.md) | All open epics
**Epics in scope:** 3
  - Core API: 16 stories (4 remaining)
  - Dashboard: 8 stories (all pending)
  - Notifications: 5 stories (all pending)

**Total stories remaining:** 17
**Estimated sprints:** 2-3 (at 20 pts/sprint)

Starting Phase 1 — Epic Completion Loop.
```

Initialize the state file and proceed.

### Step 2: Sprint Planning

Invoke the `/sprint-plan` skill:

- **GitHub mode:** `/sprint-plan <owner/repo>`
- **Local mode:** `/sprint-plan` (reads from configured backlog path)

**If PRD-scoped:** Ensure the sprint plan only pulls from the scoped stories (recorded in the state file). If `/sprint-plan` proposes stories outside the scope, exclude them — they belong to other work and should not be mixed into this orchestration run.

**Blocked-by gate:** Before selecting stories for the sprint, exclude any
story whose `blocked_by` list contains an open (not yet `done`) story. This
naturally gates implementation epics on the design-spike epic when one
exists: implementation stories list the design-spike CONTEXT.md story as a
blocker, so they cannot enter a sprint until that story completes. The
existing dependency mechanism in `/sprint-plan` already honors this; this
note is an explicit affirmation, not a new requirement.

Since this is autonomous mode, accept the default sprint plan without waiting for user confirmation — the skill's proposed sprint based on priority ordering and velocity target is the plan.

After planning completes, update the state file with the sprint stories and their dependency map.

### Step 3: Story Execution

Execute all `executor:claude` stories in the current sprint by invoking the **sprint_pipeline.js** workflow script. Skip `executor:human` and `executor:cowork` stories — they roll over to the next sprint automatically.

#### Path Resolution

The workflow script ships at `<skills-root>/_workflows/sprint_pipeline.js`, where `<skills-root>` is the parent directory of this SKILL.md's parent. For a SKILL.md at `~/.claude/skills/project-orchestrate/SKILL.md`, the workflow script absolute path is `~/.claude/skills/_workflows/sprint_pipeline.js`. The same algorithm works for global, local, and plugin install layouts.

#### Pre-spawn checks

Before invoking the workflow:

1. **Independence check.** Exclude stories whose `blocked_by` references unresolved blockers. Only pass ready stories to the workflow.
2. **Persona resolution.** For each story, resolve its persona (`impl`, `ops`, `research`) from labels (GitHub/Trello/Jira) or the `persona` frontmatter field (local mode). Default to `impl`. Build a `personaPreambles` map from the preambles in `../shared/references/PERSONAS.md` to pass to the workflow.
3. **Skip human/cowork stories.** Log them as skipped in the state file before invoking.

#### Invocation

Invoke the Workflow tool with `scriptPath` set to the resolved absolute path and `args` set to:

```yaml
stories:            <array of StorySchema-shaped story objects from the current sprint, filtered to executor:claude + ready>
epicSlug:           <current epic slug>
releaseBranch:      release/<epic-slug>
contextMdPath:      <paths.context>/<epic-slug>/CONTEXT.md (or omit if no design-spike)
claudeMdPath:       project CLAUDE.md absolute path (or omit if absent)
backendMode:        local | github | jira | trello
repoIdentifier:     <owner/repo> (github mode only)
personaPreambles:   { impl: "...", ops: "...", research: "..." }
```

Wait for the workflow to return. The return is `SprintStoryReturn[]` — one entry per completed (or blocked / failed) story per `lib/workflows/schemas/SprintStoryReturnSchema.json`.

#### Post-workflow persistence

For each entry in the workflow's return:

- `status: "done"` — Update the story file's frontmatter to `status: done`. Record `branch`, `prUrl` (github) or merge commit (local), and commit SHAs in the state file's "Current Sprint Stories" table.
- `status: "blocked"` — Record `blockers[]` and `reason` in the state file. Add the `blocked` label to the story (or mark blocked locally). Continue.
- `status: "failed"` — Same persistence as blocked, plus log the failure for sprint-release to roll over.

#### Concurrency and barriers

The workflow runs up to `min(16, cpu_cores - 2)` stories concurrently with no per-stage barriers — each story's pipeline is independent, so one slow review doesn't gate other stories' implementations. The barrier-removal benefit is unconditional; the concurrency lift is conditional on host cores (a 4-core host gets concurrency 2, an 8-core host gets 6, a 18+-core host gets the full 16). On all hosts this still beats v1.x's hardcoded 3 + barriers model on most sprint sizes.

#### Progress updates

The workflow surfaces structured progress via the Workflow tool's UI. Additionally, the executing agent SHOULD emit a concise summary line after the workflow returns:

```
Sprint 2: 5/8 stories done (13/19 pts) — 2 blocked, 1 needs review
```

### Step 4: Sprint Release

Once all `executor:claude` stories in the sprint are complete (or retried and marked blocked), invoke the sprint release skill:

- **GitHub mode:** `/sprint-release <owner/repo>`
- **Local mode:** `/sprint-release` (reads from configured backlog path)

This closes the sprint, handles rolled-over stories, and merges the release branch to `development` (local mode: direct merge; GitHub mode: opens a release PR).

### Step 5: Review and Merge to Development

After `/sprint-release` completes, run the automated review gate before
finalizing.

**Step 5a: Automated Review**

Spawn a review subagent using the `review` persona from
`../shared/references/PERSONAS.md`:

**GitHub mode:**
```
Task({
  subagent_type: "general-purpose",
  prompt: "<review preamble from PERSONAS.md>

  Review PR #<pr-number> in <owner/repo>.

  The PR merges release/<epic-slug> into development and contains all
  stories from Sprint <N>:
  <list story numbers, titles, and their personas>

  Read the full diff. Post review comments anchored to specific files/lines.
  End with a summary comment: finding counts by severity and a
  recommendation of merge, merge-with-followup-issues, or block.

  IMPORTANT: Read the project's CLAUDE.md first — review against the
  project's actual conventions, not generic standards."
})
```

**Local mode:**
```
Task({
  subagent_type: "general-purpose",
  prompt: "<review preamble from PERSONAS.md>

  Review the sprint release merge on the development branch.

  Run: git diff <pre-merge-sha>..HEAD on the development branch.

  This merge contains all stories from Sprint <N>:
  <list story file paths, titles, and their personas>

  Read the full diff. Report findings with specific file paths and line
  numbers. End with a summary: finding counts by severity and a
  recommendation of accept, accept-with-followups, or revert.

  IMPORTANT: Read the project's CLAUDE.md first — review against the
  project's actual conventions, not generic standards."
})
```

**Step 5b: Act on Review Findings**

- **If recommendation is `block`/`revert`** (any critical findings):
  Pause orchestration. Present the critical findings to the user and ask
  how to proceed. Update state file with `Status: paused`.
  In local mode, the merge already landed — if the user chooses to revert,
  run `git revert <merge-commit>` on development.

- **If recommendation is `merge-with-followup-issues`/`accept-with-followups`** (warnings only):
  Create follow-up items for each warning finding:
  - **GitHub mode:**
    ```bash
    gh issue create --repo <owner/repo> --title "Follow-up: <finding summary>" \
      --body "<finding detail from review>" \
      --label "type:chore" --label "source:review" --label "executor:claude"
    ```
  - **Local mode:** Create a story file in the appropriate epic directory:
    ```markdown
    <!-- <backlog-path>/<epic-slug>/NNN-followup-<slug>.md -->
    ---
    title: "Follow-up: <finding summary>"
    status: backlog
    executor: claude
    priority: P2-medium
    points: 2
    labels: [type:chore, source:review]
    persona: impl
    ---
    <finding detail from review>
    ```
  Then proceed.

- **If recommendation is `merge`/`accept`** (clean or info-only):
  Proceed.

**Step 5c: Merge (GitHub mode only)**

```bash
gh pr merge <pr-number> --repo <owner/repo> --squash
```

In local mode, `/sprint-release` already merged the release branch to
development directly — no additional merge step needed.

**Skip review:** If the environment variable `ORCHESTRATE_SKIP_REVIEW=1` is
set, skip Step 5a/5b entirely (original behavior).

If merge conflicts exist:
1. Attempt automatic resolution by rebasing the release branch onto `development`
2. If auto-resolution fails, **pause orchestration** and escalate to the user:
   ```
   ⚠️ Merge conflict on release/<epic-slug> → development
   Conflicting files: <list>

   Orchestration paused. Please resolve conflicts and resume.
   ```
3. Update the state file with `Status: paused` and the conflict details.

### Step 6: Branch Cleanup

After successful merge, clean up merged branches (standing authorization):

```bash
# Delete merged story branches
git fetch origin
git branch -r --merged origin/development | grep -E 'origin/story/' | sed 's|origin/||' | while read branch; do
  git push origin --delete "$branch"
done

# If the release branch is fully merged and the epic is complete, delete it too
git push origin --delete release/<epic-slug>

# Prune local references
git remote prune origin
```

Never delete `main` or `development`.

### Step 7: Epic Completion Check

After each sprint cycle, check if the current epic is complete:

**GitHub mode:**
```bash
# Check remaining open issues for this epic
gh api repos/<owner/repo>/milestones/<milestone-number> --jq '{open_issues, closed_issues}'
```

**Local mode:**
```bash
# Count story statuses in the epic directory
# Read all story files in <backlog-path>/<epic-slug>/, check frontmatter status
```

**If open issues remain** (excluding `executor:human`/`executor:cowork` stories that were skipped):
- Check if remaining stories are all human/cowork → if yes, the epic's claude-executable work is done, move to next epic
- Otherwise → loop back to Step 2 for another sprint

**If all stories are complete:**

- **GitHub mode:**
  ```bash
  # Close the epic
  gh api repos/<owner/repo>/milestones/<milestone-number> -X PATCH -f state="closed"
  ```
- **Local mode:** Update `_epic.md` frontmatter to `status: closed`.

**If more in-scope epics remain** → move to the next epic (by priority) and loop back to Step 2. When PRD-scoped, only consider epics listed in the state file's scoped epics.

**If all in-scope epics are complete** → transition to Phase 2.

Print a phase transition summary:

```
## Phase 1 Complete — All Epics Done

**Sprints completed:** 4
**Stories delivered:** 32
**Stories skipped (human/cowork):** 6
**Total points delivered:** 89

Transitioning to Phase 2 — Emulation Hardening.
```

---

## Phase 2 — Emulation Hardening Loop

Validate the **entire codebase** through emulation, fix discovered issues, and repeat until clean. This phase always covers the full project regardless of whether Phase 1 was PRD-scoped — new code must integrate cleanly with the existing codebase.

**Phase 2 is mandatory.** Do not skip it under any circumstance, even when Phase 1 produced a small or clean change set. The emulation pass is the quality gate that catches integration drift, layer contract mismatches, and cross-story inconsistency that per-story review cannot. Skipping it defeats the orchestration's quality model. See Default Operating Mode.

### Step 8: Run Emulation

Invoke the project emulation skill:

```
/project-emulate
```

This produces the full emulation report in `.claude-scrum-skill/reports/emulation-report/`, including `ISSUES.md` with categorized findings.

### Step 9: Parse Findings

Read and parse `.claude-scrum-skill/reports/emulation-report/ISSUES.md`. Extract findings by severity:

- **Critical** — must fix (blocks production readiness)
- **Warning** — should fix (degrades quality or reliability)
- **Info** — may fix (cleanup, minor improvements)

If no critical or warning findings exist → skip to Step 14 (Project Cleanup).

Count and categorize:

```
## Emulation Results (Run <N>)

**Critical:** 3 findings
**Warning:** 7 findings
**Info:** 4 findings

Generating hardening PRD for 10 actionable findings.
```

### Step 10: Generate Hardening PRD

Create a PRD document at `.claude-scrum-skill/hardening-prd-run-<N>.md` from the emulation findings. This PRD becomes the input for scaffolding a hardening epic.

Structure the PRD as:

```markdown
# Hardening PRD — Run <N>

## Overview
Automated hardening pass based on emulation findings from run <N>.
Addresses <count> critical and <count> warning issues discovered during
full-project emulation.

## Epic: Hardening (Run <N>)

### Stories

#### Fix: <Issue title from ISSUES.md>
**Priority:** <P0 for critical, P1 for warning>
**Executor:** claude
**Story Points:** <estimate based on scope>
**Acceptance Criteria:**
- <derived from the issue description>
- Verify fix by re-checking the specific integration seam / layer contract / workflow

#### Fix: <next issue>
...
```

Only include critical and warning findings. Info-level findings are logged but not scaffolded.

### Step 11: Scaffold Hardening Epic

Invoke project scaffold with the hardening PRD to create a single "Hardening (Run N)" epic:

```
/project-scaffold .claude-scrum-skill/hardening-prd-run-<N>.md
```

This creates the milestone, issues, labels, and branches for the hardening work.

### Step 12: Execute Hardening Sprints

Run the same sprint loop as Phase 1 (Steps 2-7) for the hardening epic. Since hardening stories are typically all `executor:claude`, this should proceed fully autonomously.

### Step 13: Re-validate

After the hardening epic is complete, run emulation again:

```
/project-emulate
```

Parse the new findings:

- **If new critical or warning findings exist** → increment the run counter and loop back to Step 10
- **If clean (no critical or warning findings)** → proceed to Step 14 (Project Cleanup)

Safety valve: If this is the 3rd consecutive hardening run, pause and escalate to the user:

```
⚠️ Hardening loop has run 3 times without reaching a clean state.
Remaining findings may require human judgment.

<summary of remaining findings>

Options:
1. Continue for another hardening run
2. Accept current state and finish
3. Review findings manually
```

---

## Phase 3 — Project Cleanup

After emulation hardening is clean (or accepted), run a final mechanical hygiene pass to ensure the codebase builds, lints, and tests cleanly.

**Phase 3 is mandatory.** Like Phase 2, it always runs at the tail of every orchestration even when the codebase appears clean. For projects with no traditional toolchain (e.g., a markdown skill suite), `project-cleanup` reports SKIP for the non-applicable phases — that is the correct outcome, not a reason to omit the phase. See Default Operating Mode.

### Step 14: Run Project Cleanup

Invoke the cleanup skill in fix mode:

```
/project-cleanup --fix
```

This runs across the **entire codebase** and automatically fixes:
- Build errors and warnings (type errors, unused variables, deprecations)
- Lint violations (ESLint/Biome/etc. with `--max-warnings 0`)
- HATEOAS compliance gaps (missing `_links`, pagination links, consistency)
- Dead and duplicated code (unused exports, files, dependencies, commented-out code)
- Failing tests and coverage gaps (targets 50% minimum across all metrics)

After cleanup completes, read the report at `.claude-scrum-skill/reports/cleanup-report/SUMMARY.md`:

- **If all phases PASS** → proceed to Step 15 (Completion Summary)
- **If any phase FAIL** → review the report, attempt a second cleanup pass. If issues persist after two passes, log remaining issues and proceed to Step 15 with a note

Print a phase transition summary:

```
## Phase 3 Complete — Project Cleanup

**Build:** ✅ zero errors, zero warnings
**Lint:** ✅ zero violations
**Project Principles:** ✅ compliant (or SKIP if no principles in CLAUDE.md)
**Dead code:** ✅ none detected
**Tests:** ✅ all passing, <pct>% coverage

Proceeding to completion summary.
```

### Step 15: Completion Summary

Print a comprehensive summary of the entire orchestration run:

```
## Orchestration Complete

### Phase 1 — Epic Completion
- **Epics completed:** <N>
- **Sprints executed:** <N>
- **Stories delivered:** <N> (<points> story points)
- **Stories skipped (human/cowork):** <N>
- **Average velocity:** <points>/sprint

### Phase 2 — Emulation Hardening
- **Hardening runs:** <N>
- **Issues fixed:** <N> critical, <N> warning
- **Final emulation status:** ✅ Clean / ⚠️ Accepted with <N> remaining

### Phase 3 — Project Cleanup
- **Build:** ✅ clean / ⚠️ <N> remaining issues
- **Lint:** ✅ clean / ⚠️ <N> remaining issues
- **Project Principles:** ✅ compliant / ⚠️ <N> violations / ⏭️ skipped (no principles in CLAUDE.md)
- **Dead code:** ✅ none / ⚠️ <N> items remaining
- **Tests:** ✅ passing (<pct>% coverage) / ⚠️ <N> failing, <pct>% coverage
- **Full report:** .claude-scrum-skill/reports/cleanup-report/SUMMARY.md

### Timeline
- Started: <timestamp>
- Phase 1 completed: <timestamp>
- Phase 2 completed: <timestamp>
- Phase 3 completed: <timestamp>

### Remaining Work
- <N> human/cowork stories still open across <N> epics
- <list any deferred or unresolved items>
```

Update the state file with `Status: completed`.

### Step 16: ADR Update

Review the work completed during this orchestration run and determine if any
decisions merit an Architecture Decision Record.

Read the ADR output path from `../shared/config.json` (key: `paths.adr`,
default: `.claude-scrum-skill/adr`).

1. Read all existing ADRs in the configured ADR directory to understand what's
   already documented and the numbering/format convention in use. Compute
   the next sequential ADR number as `max(existing_numbers) + 1`. This
   shared numbering pool applies regardless of whether prior ADRs were
   created by a design-spike epic in this run, by a previous orchestration
   run, or hand-authored — they all share one sequence.
2. Review the epics completed, hardening fixes applied, and any significant
   technical choices made during orchestration (e.g., new libraries adopted,
   patterns introduced, infrastructure changes, security model decisions).
3. For each decision that is **non-obvious, hard to reverse, or would
   surprise a future contributor**, create a new ADR following the existing
   format and numbering sequence.
4. Skip decisions that are already covered by an existing ADR (including
   any ADR produced by a design-spike epic earlier in this run) or that
   are trivial/self-evident from the code.

Print a summary:

```
### ADRs
- **Existing:** <N> ADRs in .claude-scrum-skill/adr/
- **Created:** <N> new ADRs
  - ADR-<NNN>: <title>
  - ADR-<NNN>: <title>
- **Skipped:** No new decisions warranting ADRs (if none created)
```

### Step 17: Clean Up State File

Delete `.claude-scrum-skill/orchestration-state.md` so the next orchestration
run starts with a clean slate:

```bash
rm -f .claude-scrum-skill/orchestration-state.md
```

**In multi-path mode, Step 17 is suppressed.** The multi-path wrapper handles per-spec state file archival with a slug-suffixed name instead — see Sequential Multi-Path Mode → Per-Spec State File Lifecycle.

---

## Sequential Multi-Path Mode

Applies when Mode Classification selected sequential multi-path mode (2+ tokens, all paths to existing files, `--merged` not set). This section is the wrapper that invokes the existing single-spec orchestration (Phases 1-3 + Step 16 + Step 17, as documented above) once per spec, in the order determined by Dependency Resolution.

### Per-Spec Loop

The per-spec loop is **executed by the skill markdown** (not a wrapping workflow), because the inner per-spec orchestration invokes individual workflows (`sprint_pipeline.js`, `elaborate_epics.js`, etc.) via the Workflow tool. The Workflow tool's nesting constraint ("one level of nesting only") prevents a multi-spec-queue workflow from invoking sub-workflows that themselves invoke workflows; the skill markdown is the right layer to orchestrate per-spec iteration.

For each spec in the topologically-sorted execution order:

1. Update the queue state file: mark this spec's row as `in-progress`, record `Started` timestamp.
2. Invoke the full single-spec orchestration against this spec — re-enter Phase 1 (Epic Completion Loop, including scaffolding via `/project-scaffold`), Phase 2 (Emulation Hardening Loop), Phase 3 (Project Cleanup), Step 16 (ADR Update). Each of these phases internally invokes workflows (`sprint_pipeline.js`, `elaborate_epics.js`, `adversarial_verify.js`, `review_panel.js`) as documented in their respective sections. Step 17 (state file cleanup) is **suppressed** in multi-path mode; archive instead with the slug-suffixed naming below.
3. On the spec's natural completion: archive `.claude-scrum-skill/orchestration-state.md` to `.claude-scrum-skill/orchestration-state-<spec-slug>.previous.md` BEFORE the next spec begins. Update the queue state file: mark this spec's row as `completed`, record `Completed` timestamp, update aggregate stats.
4. On the spec's safety-gate pause:
   - **Without `--skip-on-pause`** (default): per-spec state file remains at `.claude-scrum-skill/orchestration-state.md` with `Status: paused`. Update the queue state file: mark this spec's row as `paused`, set queue `Status: paused`. Exit. Remaining specs are NOT started. User resolves the gate and re-invokes; queue resumes from the paused spec.
   - **With `--skip-on-pause`**: archive `.claude-scrum-skill/orchestration-state.md` to `.claude-scrum-skill/orchestration-state-<spec-slug>.skipped.md`. Update the queue state file: mark this spec's row as `skipped`, record the pause reason. Continue to the next spec.
5. Per-spec orchestration runs to completion (or pause) before the next spec begins — no interleaving of sprints, no concurrent execution.

After all specs are processed, emit the Cumulative Summary per the subsection below.

### Spec Slug Derivation

A spec's slug is derived from its filename: `basename(path, ".md")`.

- `docs/specs/20260527_215752_multi_spec_sequential_orchestration.md` → `20260527_215752_multi_spec_sequential_orchestration`
- `spec-a.md` → `spec-a`

If two specs in the same invocation produce the same slug (e.g., one is `foo/spec.md`, another is `bar/spec.md`), ABORT before starting any spec — slug collisions would clobber each other's archived state files. Error format:

```
ERROR: Spec slug collision. No specs were started.

Colliding specs:
  foo/spec.md → slug "spec"
  bar/spec.md → slug "spec"

Rename one of the specs so basenames differ, then re-run.
```

### Per-Spec State File Lifecycle

| Event | State file action |
|-------|-------------------|
| Spec starts | Per-spec orchestration creates `.claude-scrum-skill/orchestration-state.md` (existing v1.7.1 behavior). |
| Spec completes naturally | Wrapper renames to `.claude-scrum-skill/orchestration-state-<slug>.previous.md`. |
| Spec pauses, no `--skip-on-pause` | File remains at canonical location with `Status: paused`. Queue exits. |
| Spec pauses, with `--skip-on-pause` | Wrapper renames to `.claude-scrum-skill/orchestration-state-<slug>.skipped.md`. Queue advances. |
| Resume from paused state | Per-spec orchestration reads `.claude-scrum-skill/orchestration-state.md` and resumes (existing v1.7.1 behavior). The wrapper resumes the queue from this spec's position based on the queue state file. |

Single-spec mode state file lifecycle is unchanged from v1.7.1 — no slug suffix, no queue file. Step 17's `rm -f` runs as it always did. Only multi-path mode uses the slug-suffix archival and suppresses Step 17.

### Queue State File

Multi-path mode maintains a queue state file at `.claude-scrum-skill/orchestration-queue-state.md` tracking the entire run. The file is human-readable markdown.

**Structure:**

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

**Lifecycle:**

- Created at multi-path mode start (after Mode Classification, Flag Parsing, Glob Expansion, and Dependency Resolution all pass).
- Updated after every spec status transition: pending → in-progress → completed | paused | skipped.
- On clean completion (all specs `completed` or `skipped`, none `paused`): renamed to `orchestration-queue-state.previous.md`. The wrapper emits the Cumulative Summary.
- On paused run: remains in place with `Status: paused` and the paused spec identified. Resume continues from the paused spec.

**On startup**, check for an existing `.claude-scrum-skill/orchestration-queue-state.md`:

- `Status: running` → resume from the recorded position (autonomous default).
- `Status: paused` → resume from the recorded position. The paused spec's per-spec state file is read by its own resume logic.
- `Status: completed` → rename to `orchestration-queue-state.previous.md` and start a fresh run.
- No file → initialize a new queue state file.

Never prompt. Same autonomous-default discipline as the single-spec state file (see Default Operating Mode).

### Safety-Gate Pause Announcements

**Default (without `--skip-on-pause`):**

```
[Spec 2/3] spec-b.md — paused on safety gate.

Pause reason: 3rd consecutive hardening run produced 2 critical findings
(see .claude-scrum-skill/reports/emulation-report/ISSUES.md).

Remaining specs (1) are not started. Queue state preserved at
.claude-scrum-skill/orchestration-queue-state.md.

Resolve the findings and re-invoke /project-orchestrate with the same
arguments to resume. The queue picks up at spec-b.md.
```

**With `--skip-on-pause`:**

```
[Spec 2/3] spec-b.md — paused on safety gate. --skip-on-pause set; marking skipped.

Skipped reason: 3rd consecutive hardening run produced 2 critical findings.
State archived to .claude-scrum-skill/orchestration-state-spec-b.skipped.md.

Continuing to Spec 3/3 — spec-c.md
```

### Resume Semantics

A multi-path run paused on a safety gate is resumed by re-invoking `/project-orchestrate` with the same argument list. The queue state file's recorded execution order takes precedence — even if a spec's `depends_on` frontmatter changed between attempts, the resumed run uses the order recorded at the original run's start. This prevents subtle ordering shifts mid-run.

Completed specs are NOT re-executed on resume. The wrapper skips entries marked `completed` and `skipped`, resumes the entry marked `paused` (handing off to the per-spec orchestration's own resume logic), and continues with `pending` entries afterward.

### Cumulative Summary

At the end of a multi-path run (all specs `completed` or `skipped`, none `paused`), emit a cumulative summary mirroring the existing single-spec completion summary structure, with a per-spec section plus an aggregate header.

Format:

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

After emitting the summary, mark the queue `Status: completed` and rename `orchestration-queue-state.md` → `orchestration-queue-state.previous.md`.

### Merged Mode (Opt-In)

When `--merged` is set alongside 2+ PRD paths, the skill treats the inputs as one combined multi-spec project using legacy best-effort behavior — the pre-v1.8.0 path where the agent improvises merge policy at runtime (one combined scaffold call, one merged design-spike, one combined sprint cycle, one emulation, one cleanup, one ADR pass).

Emit the following deprecation-style warning BEFORE proceeding:

```
WARNING: --merged is set. Multi-path inputs will be treated as one combined
project with best-effort merge semantics. Formal merged behavior is not
yet specified (deferred to a follow-up spec); results may be inconsistent
run-to-run.

If you want predictable per-spec isolation, drop --merged and re-run.

Proceeding with merged mode...
```

Then run the legacy unified-multi-spec flow. The queue state file is still created (with `Mode: merged` in Meta) but tracks the merged invocation as a single combined orchestration rather than per-spec entries. Formal merged semantics — shared design-spike strategy, cross-spec dependency resolution, unified state file vs queue file — are deferred to a follow-up spec.

---

## Communication Pattern

Keep the user informed without being noisy:

| Event | Output |
|-------|--------|
| Orchestration start | Full overview (Step 1) |
| Sprint planned | Sprint number, story count, point total — 2 lines |
| Every 2-3 stories | Progress line with counts and latest completions |
| Story failure | Immediate single-line alert with story number and error |
| Sprint released | Sprint scorecard — 3-4 lines |
| Review complete | Recommendation + finding counts — 2 lines |
| Merge to development | Single confirmation line |
| Epic completed | Epic summary — 3-4 lines |
| Phase transition | Full phase summary |
| Hardening run start | Run number and finding counts |
| Cleanup started | Single line: "Running project cleanup..." |
| Cleanup complete | Phase 3 summary — 5-6 lines with pass/fail per dimension |
| ADRs updated | Count of new ADRs + titles — 2-3 lines |
| Orchestration complete | Full completion summary (Step 17) |
| Error/pause | Immediate alert with context and options |

---

## Error Handling

### Subagent Failures
- Retry once with additional context about the failure
- If second attempt fails, mark story as blocked, log the error, and continue
- Do not let a single story failure halt the entire sprint

### Merge Conflicts
- Attempt automatic rebase resolution first
- If auto-resolution fails, pause orchestration and escalate to the user
- Update state file with conflict details for resume

### State File Corruption
- If `.claude-scrum-skill/orchestration-state.md` is unreadable or malformed, reconstruct state from GitHub:
  ```bash
  # Get sprint and story status from the project board
  # Get branch state from git
  # Get PR state from gh
  ```
- Log the reconstruction and continue

### Rate Limiting
- If GitHub API returns 429 or secondary rate limit errors, back off exponentially:
  - First: wait 30 seconds
  - Second: wait 60 seconds
  - Third: wait 2 minutes
  - Fourth: pause orchestration and notify the user

### CI Failures on Release Branch
- If CI fails on the release PR, do not merge
- Report the failure with links to the failing checks
- Attempt to identify the failing test or build step
- If the fix is straightforward, create a fix commit on the release branch and retry
- If not, pause and escalate

### Usage Cap / Context Compaction
- The state file ensures progress is not lost
- On resume, read the state file and continue from the last recorded position
- The log section provides context about what happened before compaction
