---
name: sprint-status
description: Generate a status report for the current sprint. Shows progress by story, executor breakdown, burndown, blockers, and items needing attention. Use for daily standups, mid-sprint check-ins, or when asked about project progress.
allowed-tools: Bash, Read, Grep
argument-hint: [owner/repo] [project-number]
---

# Sprint Status

Generate a comprehensive status report for the active sprint.

## Before You Start

1. Read `../project-scaffold/references/CONVENTIONS.md` for project management standards.
2. Confirm the `gh` CLI is authenticated.

## Input

`$ARGUMENTS` should be the repo identifier and optionally the project number.
If not provided, detect from the current git remote or ask the user.

## Status Report Procedure

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
gh pr list --repo <owner/repo> --base release/<milestone-slug> --json number,title,state,mergedAt,labels
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
- Claude: <done>/<total> stories (<points> pts done)
- Human: <done>/<total> stories (<points> pts done)
- Cowork: <done>/<total> stories (<points> pts done)

### Recommendations
<Actionable suggestions: unblock items, re-prioritize, adjust scope if behind>
```
