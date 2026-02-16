---
name: sprint-release
description: Close out the current sprint and prepare a release. Generates a sprint summary, opens a release PR from the release branch into main, and transitions incomplete stories. Use when a sprint is complete or at the sprint boundary.
allowed-tools: Bash, Read, Write, Glob, Grep
argument-hint: [owner/repo] [project-number]
---

# Sprint Release

Close the current sprint and open a release PR.

## Before You Start

1. Read `../project-scaffold/references/CONVENTIONS.md` for project management standards.
2. Confirm the `gh` CLI is authenticated.

## Input

`$ARGUMENTS` should be the repo identifier and optionally the project number.
If not provided, detect from the current git remote or ask the user.

## Release Procedure

### Step 1: Verify Sprint State

```bash
# Check for any stories still "In Progress" — warn before proceeding
# Count completed vs incomplete stories
# Get the release branch name for the current milestone
```

If stories are still in progress, warn the user and ask whether to:
- Wait for completion
- Roll incomplete stories to next sprint
- Proceed anyway (mark as rolled-over)

### Step 2: Handle Incomplete Stories

For any stories not marked Done:
- Add the `rolled-over` label
- Remove from current sprint iteration
- Note them in the release summary

### Step 3: Generate Release Summary

Build a comprehensive changelog from the sprint:

```bash
# Get all merged PRs on the release branch
gh pr list --repo <owner/repo> --base release/<slug> --state merged --json number,title,labels,mergedAt,body

# Get all closed issues from this sprint
gh issue list --repo <owner/repo> --state closed --label "type:story" --json number,title,labels,closedAt
```

### Step 4: Open Release PR

```bash
gh pr create \
  --repo <owner/repo> \
  --base main \
  --head release/<milestone-slug> \
  --title "Release: Sprint <N> — <Phase Name>" \
  --body "<Release summary markdown>"
```

The PR body should include:
- Sprint summary (stories completed, points delivered)
- Full changelog (each story with brief description)
- Rolled-over items (if any)
- Notable technical changes
- Any known issues or follow-ups

### Step 5: Close Sprint Iteration

- Mark the sprint iteration as complete (via GraphQL)
- Update milestone progress

### Step 6: Output Release Summary

```
## Sprint <N> Release

**Release PR:** #<pr-number> — <link>
**Branch:** release/<slug> → main
**Stories Delivered:** <count> (<points> points)

### Changelog
- #12 User auth endpoint (5 pts)
- #13 Database schema migration (3 pts)
- #14 API key provisioning (2 pts)
...

### Rolled Over
- #18 Rate limiting (3 pts) — moved to next sprint

### Next Steps
1. Review and merge the release PR: <link>
2. Run `/sprint-plan` to start the next sprint
```
