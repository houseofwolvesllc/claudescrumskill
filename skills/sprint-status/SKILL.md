---
name: sprint-status
description: Generate a status report for the current sprint. Shows progress by story, executor breakdown, burndown, blockers, and items needing attention. Use for daily standups, mid-sprint check-ins, or when asked about project progress.
---

# Sprint Status

Generate a comprehensive status report for the active sprint.

## Before You Start

1. Read `../shared/references/CONVENTIONS.md` for project management standards.
2. Read `../shared/config.json` to determine the scaffolding mode (`scaffolding` key: `"local"`, `"github"`, `"jira"`, or `"trello"`, default: `"local"`). If `"local"`, also read the `paths.backlog` value (default: `.claude-scrum-skill/backlog`).
3. Read `../shared/references/PROVIDERS.md` for provider-specific API commands when operating in remote mode.
4. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in API commands and code — never in communication with the user.
5. **If `scaffolding: "github"`:** Confirm the `gh` CLI is authenticated.
6. **If `scaffolding: "jira"`:** Verify `JIRA_SITE`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` env vars are set.
7. **If `scaffolding: "trello"`:** Verify `TRELLO_API_KEY` and `TRELLO_TOKEN` env vars are set.
8. **If `scaffolding: "local"`:** Skip authentication. Status is read from local files.

## Input

**GitHub mode:** `$ARGUMENTS` should be the repo identifier and optionally the project number. If not provided, detect from the current git remote or ask the user.

**Jira/Trello mode:** `$ARGUMENTS` is ignored. Project key or board ID is read from config.json. Use the provider-specific API commands from PROVIDERS.md to query story status — following the same reporting logic as GitHub mode.

**Local mode:** `$ARGUMENTS` is ignored. Status is read from the configured backlog path.

---

## Local Status Report Procedure

When `scaffolding: "local"`, generate the status report from local backlog
files.

### Local Step 1: Gather Data

Find the active sprint:

```bash
# Find the active sprint file
grep -l 'status: active' <backlog-path>/sprints/sprint-*.md
```

Read the active sprint file to get the story list. Then read each referenced
story file's frontmatter for current status, executor, points, persona,
and labels.

Also check git state for additional signals:
```bash
# Recent commits on release branches
git log --oneline --since="1 week ago" --all --grep="story/"

# Open local branches (proxy for in-progress work)
git branch --list 'story/*'
```

### Local Step 2: Categorize Stories

Same categories as GitHub mode — group stories by their frontmatter
`status` field: `done`, `in-progress`, `ready`, `blocked`, `needs-context`.

### Local Step 3: Generate Report

Same report format as GitHub mode. Use story file paths instead of issue
numbers. For "Release Branch Health", check git branch state directly
instead of via `gh`.

### Local Step 4: Actionable Recommendations

Same as GitHub mode.

---

## GitHub Status Report Procedure

### Step 1: Gather Data

```bash
# Get all issues in the current sprint iteration (via GraphQL project query)
# Get issue states, labels, assignees
# Get recent PRs targeting the release branch
# Get CI status on the release branch

# Open issues with sprint assignment
gh issue list --repo <owner/repo> --state open --json number,title,labels,state,createdAt,updatedAt

# Closed issues (completed this sprint)
gh issue list --repo <owner/repo> --state closed --json number,title,labels,closedAt

# PRs targeting the release branch
gh pr list --repo <owner/repo> --base release/<epic-slug> --json number,title,state,mergedAt,labels
```

### Step 2: Categorize Stories

Group all sprint stories into:

- **Done** — Issue closed, PR merged to release branch
- **In Progress** — PR open or issue actively being worked
- **Ready** — Not started but unblocked
- **Blocked** — Has `blocked` label or unresolved dependency
- **Needs Context** — Has `needs-context` label

### Step 3: Generate Report

```
## Sprint <N> Status — <date>

**Progress:** <done>/<total> stories | <done_points>/<total_points> points (<percentage>%)
**Days Remaining:** <N> of <total> days

### Burndown
<done_points> / <total_points> points completed
<Simple ASCII progress bar>
[████████░░░░░░░░] 50%

### Completed
| # | Title | Executor | Points | Closed |
|---|-------|----------|--------|--------|
| 12 | User auth endpoint | claude | 5 | 2h ago |
...

### In Progress
| # | Title | Executor | Points | Status |
|---|-------|----------|--------|--------|
| 14 | API key provisioning | human | 2 | PR open |
...

### Ready (Not Started)
| # | Title | Executor | Points | Priority |
|---|-------|----------|--------|----------|
| 18 | Rate limiting | claude | 3 | P2 |
...

### Blocked / Needs Attention
| # | Title | Blocker | Action Needed |
|---|-------|---------|---------------|
| 16 | OAuth integration | Waiting on #15 | Complete #15 first |
...

### Executor Summary
- **Claude:** <done>/<total> stories (<points> pts done)
- **Human:** <done>/<total> stories (<points> pts done)
- **Cowork:** <done>/<total> stories (<points> pts done)

### Release Branch Health
- **Branch:** release/<epic-slug>
- **PRs merged:** <N>
- **CI status:** <passing/failing>
- **Merge conflicts:** <none/details>

### Risks & Notes
<Any observations: pace concerns, scope creep, blocked items needing escalation>
```

### Step 4: Actionable Recommendations

Based on the status, suggest next actions:

- If Claude stories are `ready-for-work`, suggest picking them up
- If human stories are overdue, flag them prominently
- If the sprint is behind pace, suggest scope reduction or story deferral
- If blockers exist, suggest resolution paths
- If the sprint is nearly complete, suggest running `/sprint-release`
