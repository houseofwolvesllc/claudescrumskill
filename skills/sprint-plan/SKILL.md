---
name: sprint-plan
description: Plan the next sprint iteration for a GitHub Project. Pulls stories from the backlog, assigns them to the upcoming sprint based on priority and capacity, and prepares the sprint for execution. Use when starting a new sprint cycle or when re-planning mid-sprint.
allowed-tools: Bash, Read, Write, Glob, Grep
argument-hint: [owner/repo] [project-number]
---

# Sprint Plan

Plan and populate the next sprint iteration for an existing GitHub Project.

## Before You Start

1. Read `../project-scaffold/references/CONVENTIONS.md` for all project management standards. Follow these conventions exactly.
2. Confirm the `gh` CLI is authenticated by running `gh auth status`.

## Input

`$ARGUMENTS` should be the repo identifier and optionally the project number.
If not provided, detect from the current git remote or ask the user.

## Planning Procedure

### Step 1: Assess Current State

```bash
# Get open milestones
gh api repos/<owner/repo>/milestones --jq '.[] | select(.state=="open") | {number, title, open_issues, closed_issues}'

# Get the project's current sprint iteration
# Use GraphQL to query the project's iteration field and find the current/next sprint

# Get backlog items (issues not assigned to a sprint, sorted by priority)
gh issue list --repo <owner/repo> --state open --label "type:story" --json number,title,labels,milestone --jq 'sort_by(.labels)'
```

Gather:
- How many stories are in the current sprint and their status
- What's in the backlog, grouped by milestone/phase
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
3. **P0-Critical stories** from the active milestone/phase
4. **P1-High stories** from the active milestone/phase
5. **P2-Medium and P3-Low** to fill remaining capacity

Stop when the total story points reach the velocity target. Present the proposed sprint to the user for approval before assigning.

### Step 4: Assign Sprint

After confirmation, update issues:

```bash
# Add sprint iteration assignment via GraphQL
# Update status to "Ready" for all sprint stories
# Ensure "ready-for-work" label is on unblocked items
# Ensure release branch exists for the target milestone
```

For each story in the sprint:
- Set the Sprint iteration field to the new sprint
- Set Status to "Ready" (or "Backlog" if dependencies aren't met yet)
- Verify labels are correct

### Step 5: Ensure Branch Exists

```bash
# Check if release branch exists for the active milestone
git ls-remote --heads origin release/<milestone-slug>

# If not, create it
git checkout main && git pull
git checkout -b release/<milestone-slug>
git push -u origin release/<milestone-slug>
```

### Step 6: Generate Sprint Kickoff Summary

```
## Sprint <N> Planned

**Sprint:** <N> | **Dates:** <start> — <end>
**Target:** <points> points across <count> stories
**Release Branch:** release/<milestone-slug>

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
