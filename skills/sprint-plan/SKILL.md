---
name: sprint-plan
description: Plan the next sprint iteration for a GitHub Project. Pulls stories from the backlog, assigns them to the upcoming sprint based on priority and capacity, and prepares the sprint for execution. Use when starting a new sprint cycle or when re-planning mid-sprint.
---

# Sprint Plan

Plan and populate the next sprint iteration for an existing GitHub Project.

## Before You Start

1. Read `../shared/references/CONVENTIONS.md` for all project management standards. Follow these conventions exactly.
2. Read `../shared/config.json` to determine the scaffolding mode (`scaffolding` key: `"local"`, `"github"`, `"jira"`, or `"trello"`, default: `"local"`). If `"local"`, also read the `paths.backlog` value (default: `.claude-scrum-skill/backlog`).
3. Read `../shared/references/PROVIDERS.md` for provider-specific API commands when operating in remote mode.
4. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in API commands and code — never in communication with the user.
5. **If `scaffolding: "github"`:** Confirm the `gh` CLI is authenticated by running `gh auth status`.
6. **If `scaffolding: "jira"`:** Verify `JIRA_SITE`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` env vars are set.
7. **If `scaffolding: "trello"`:** Verify `TRELLO_API_KEY` and `TRELLO_TOKEN` env vars are set.
8. **If `scaffolding: "local"`:** Skip authentication. The backlog is file-based.

## Input

**GitHub mode:** `$ARGUMENTS` should be the repo identifier and optionally the project number. If not provided, detect from the current git remote or ask the user.

**Jira/Trello mode:** `$ARGUMENTS` is ignored. Project key or board ID is read from config.json. Use the provider-specific API commands from PROVIDERS.md to list stories, create sprints, and assign stories — following the same planning logic as GitHub mode.

**Local mode:** `$ARGUMENTS` is ignored. Stories are read from the configured backlog path.

---

## Local Planning Procedure

When `scaffolding: "local"`, plan sprints by reading and updating local
backlog files.

### Local Step 1: Assess Current State

Read the backlog directory structure:

```bash
# List all epics
ls <backlog-path>/*/_ epic.md

# Read PROJECT.md for sprint history
cat <backlog-path>/PROJECT.md
```

For each epic directory, read `_epic.md` (status) and all story files
(frontmatter). Gather:
- Stories by status (`backlog`, `ready`, `in-progress`, `done`)
- Any stories with `rolled-over` in their labels
- Dependency chains from `blocked_by` fields

### Local Step 2: Calculate Capacity

Same as GitHub mode — ask the user or use defaults (20 points/sprint).

### Local Step 3: Select Stories for Sprint

Same priority order as GitHub mode (rolled-over → unblocked → P0 → P1 → P2 →
dependencies-first). Read story points and priorities from frontmatter.

Present the proposed sprint to the user for confirmation.

### Persona Assignment

Same as GitHub mode — check for `persona` field in story frontmatter. If
missing, apply defaults based on labels:

| Story labels | Default persona |
|---|---|
| `scope:infra`, `scope:ci`, `scope:deploy`, `scope:migration` | `ops` |
| `needs:design`, `needs:spike` | `research` |
| All other stories | `impl` (no change needed) |

Update the story file's frontmatter `persona` field.

### Local Step 4: Assign Sprint

Create a sprint file at `<backlog-path>/sprints/sprint-<N>.md`:

```markdown
---
number: <N>
status: active
start: <ISO date>
end: <ISO date>
velocity_target: <points>
velocity_actual: null
---

# Sprint <N>

## Stories
| File | Title | Executor | Persona | Points | Priority | Status |
|------|-------|----------|---------|--------|----------|--------|
| core-api/001-user-auth.md | User auth endpoint | claude | impl | 5 | P1-high | ready |
...
```

Update each selected story's frontmatter:
- Set `sprint: <N>`
- Set `status: ready` (or `backlog` if dependencies aren't met)

### Local Step 5: Ensure Branch Exists

Same as GitHub mode — create release branches from `development` for each
active epic. Git operations work identically in local mode.

### Local Step 6: Generate Sprint Kickoff Summary

Same format as GitHub mode, but reference story file paths instead of issue
numbers.

---

## GitHub Planning Procedure

### Step 1: Assess Current State

```bash
# Get open epics (milestones)
gh api repos/<owner/repo>/milestones --jq '.[] | select(.state=="open") | {number, title, open_issues, closed_issues}'

# Get the project's current sprint iteration
# Use GraphQL to query the project's iteration field and find the current/next sprint

# Get backlog items (issues not assigned to a sprint, sorted by priority)
gh issue list --repo <owner/repo> --state open --label "type:story" --json number,title,labels,milestone --jq 'sort_by(.labels)'
```

Gather:
- How many stories are in the current sprint and their status
- What's in the backlog, grouped by epic
- Any `rolled-over` items from the previous sprint (these get priority)

### Step 2: Calculate Capacity

Ask the user (or use defaults):
- Sprint length (default: 2 weeks per CONVENTIONS.md)
- Velocity estimate (story points per sprint — use previous sprint actuals if available)
- Any known unavailability or constraints

Default starting velocity if no history: **20 points** per sprint.

### Step 3: Select Stories for Sprint

Fill the sprint in this priority order:

1. **Rolled-over stories** from previous sprint (label: `rolled-over`)
2. **Blocked items that are now unblocked** (remove `blocked` label, add `ready-for-work`)
3. **P0-critical** stories from the current epic
4. **P1-high** stories from the current epic
5. **P2-medium** stories if capacity remains
6. **Dependencies-first** — if story B depends on story A, include A before B

Stop when total story points reach the velocity target. Present the proposed sprint:

```
## Proposed Sprint <N>

**Dates:** <start> — <end>
**Capacity:** <velocity> points
**Planned:** <total points> points

| # | Title | Points | Executor | Priority | Epic |
|---|-------|--------|----------|----------|------|
| 12 | User auth endpoint | 5 | claude | P1-high | Core API |
| 13 | Login UI component | 3 | claude | P1-high | Core API |
| 14 | API key provisioning | 2 | human | P1-high | Core API |
...

**Rolled over:** <count> stories (<points> points)
**New:** <count> stories (<points> points)
**Remaining capacity:** <points> points
```

Ask the user to confirm, adjust, or add/remove stories.

### Step 4: Assign Sprint

After confirmation, update issues:

```bash
# Add sprint iteration assignment via GraphQL
# Update status to "Ready" for all sprint stories
# Ensure "ready-for-work" label is on unblocked items
# Ensure release branch exists for the target epic
```

For each story in the sprint:
- Set the Sprint iteration field to the new sprint
- Set Status to "Ready" (or "Backlog" if dependencies aren't met yet)
- Verify labels are correct

### Persona Assignment

For each story assigned to the sprint, check for an existing `persona:*`
label. If none exists, apply a default based on the story's other labels:

| Story labels | Default persona |
|---|---|
| `scope:infra`, `scope:ci`, `scope:deploy`, `scope:migration` | `persona:ops` |
| `needs:design`, `needs:spike` | `persona:research` |
| All other stories | No label needed (implicit `impl`) |

Apply the label:

```bash
# Only if the story doesn't already have a persona:* label
gh issue edit <number> --repo <owner/repo> --add-label "persona:ops"
```

This is a default heuristic. Users can override by manually labeling stories
before planning. The orchestrator reads whatever label is present at
execution time.

### Step 5: Ensure Branch Exists

```bash
# Check if release branch exists for the active epic
git ls-remote --heads origin release/<epic-slug>

# If not, create it from development
git checkout development && git pull
git checkout -b release/<epic-slug>
git push -u origin release/<epic-slug>
```

### Step 6: Generate Sprint Kickoff Summary

```
## Sprint <N> Planned

**Sprint:** <N> | **Dates:** <start> — <end>
**Target:** <points> points across <count> stories
**Release Branch:** release/<epic-slug>

### By Executor
- Claude: <N> stories (<points> pts) — ready for autonomous execution
- Human: <N> stories (<points> pts) — requires your attention
- Cowork: <N> stories (<points> pts) — delegatable via Cowork

### Sprint Goals
<2-3 sentence summary of what this sprint accomplishes in the context of the overall project>

### Blockers/Risks
<Any known risks, unresolved dependencies, or open questions>

### Next Steps
- Claude can begin picking up `executor:claude` + `ready-for-work` stories
- Review `executor:human` stories for your personal task list
- Run `/sprint-status` anytime to check progress
- Run `/sprint-release` when the sprint is complete
```
