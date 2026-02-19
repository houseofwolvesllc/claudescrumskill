---
name: sprint-release
description: Wrap up a sprint by generating a release summary, opening the release PR to main for human review, handling incomplete stories, and preparing for the next sprint. Use when a sprint is complete or at the sprint boundary deadline.
---

# Sprint Release

Close out a sprint: summarize work, handle incomplete stories, open the release PR for review.

## Before You Start

1. Read `../project-scaffold/references/CONVENTIONS.md` for project management standards.
2. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in GitHub API commands and code — never in communication with the user.
3. Confirm the `gh` CLI is authenticated.

## Input

`$ARGUMENTS` should be the repo identifier and optionally the project number.
If not provided, detect from the current git remote or ask the user.

## Release Procedure

### Step 1: Sprint Inventory

Gather the complete picture of the sprint:

```bash
# All issues assigned to the current sprint
# Closed issues (completed work)
gh issue list --repo <owner/repo> --state closed --milestone "<Epic Name>" --json number,title,labels,closedAt

# Still-open issues in the sprint (incomplete work)
gh issue list --repo <owner/repo> --state open --milestone "<Epic Name>" --json number,title,labels

# All merged PRs to the release branch
gh pr list --repo <owner/repo> --base release/<epic-slug> --state merged --json number,title,mergedAt,body

# Check CI on release branch
gh run list --repo <owner/repo> --branch release/<epic-slug> --limit 5
```

### Step 2: Handle Incomplete Stories

For any stories that are still open:

1. **In Progress (PR open but not merged):**
   - Ask the user: merge now, or roll over?
   - If rolling over, move to next sprint iteration

2. **Ready (never started):**
   - Add `rolled-over` label
   - Move to next sprint iteration
   - Adjust priority if needed

3. **Blocked:**
   - Note the blocker in the release summary
   - Keep in backlog with `blocked` label
   - Do NOT auto-assign to next sprint

For each rolled-over story:
```bash
gh issue edit <number> --repo <owner/repo> --add-label "rolled-over"
# Update sprint iteration field via GraphQL to next sprint
```

### Step 3: Build the Release PR Body

Compose a comprehensive PR description:

```markdown
## Sprint <N> Release — <Epic Name>

**Sprint Dates:** <start> — <end>
**Stories Completed:** <done>/<planned> (<percentage>%)
**Story Points Delivered:** <done_points>/<planned_points>

### What's in This Release

<2-3 paragraph narrative summary of what was accomplished this sprint.
Write this in plain language suitable for a project stakeholder.
Focus on capabilities delivered, not implementation details.>

### Completed Stories

| # | Title | Executor | Points |
|---|-------|----------|--------|
| 12 | User auth endpoint | claude | 5 |
| 13 | Login UI component | claude | 3 |
| 14 | API key provisioning | human | 2 |
...

### Deferred / Rolled Over

| # | Title | Reason | Next Sprint |
|---|-------|--------|-------------|
| 18 | Rate limiting | Not started — capacity | Sprint 2 |
...

### Technical Notes

<Any architectural decisions made during the sprint,
tech debt introduced, patterns established, or concerns
for the reviewer to be aware of.>

### Test Coverage

<Summary of test status: what's covered, any gaps, CI status>

### Merge Checklist

- [ ] CI passing on release branch
- [ ] All sprint stories accounted for (completed or deferred)
- [ ] No merge conflicts with main
- [ ] Reviewed release summary above
```

### Step 4: Open the Release PR

The release PR targets `development`, NOT `main`. The development → main promotion is a separate, human-initiated production release.

```bash
# Ensure release branch is up to date
git checkout release/<epic-slug> && git pull

# Check for conflicts with development
git fetch origin development
git merge-tree $(git merge-base HEAD origin/development) HEAD origin/development

# Open the PR targeting development
gh pr create \
  --repo <owner/repo> \
  --base development \
  --head release/<epic-slug> \
  --title "Release: Sprint <N> — <Epic Name>" \
  --body "<release PR body from Step 3>" \
  --reviewer <owner> \
  --label "type:release"
```

If there are merge conflicts with development:
- Report them clearly to the user
- Offer to resolve them or flag for manual resolution
- Do NOT open the PR until conflicts are resolved

### Step 5: Close the Epic (if all stories are complete)

If all stories in the epic (milestone) are complete (no open issues remaining):

```bash
gh api repos/<owner/repo>/milestones/<milestone-number> -f state="closed"
```

If stories remain, keep the epic open for the next sprint.

### Step 6: Generate Release Report

```
## Sprint <N> Release Complete

**Release PR:** #<pr-number> — awaiting your review
**Branch:** release/<slug> → development

### Sprint Scorecard
- **Velocity:** <points_completed> points (target was <planned_points>)
- **Completion:** <percentage>% of planned stories
- **Claude efficiency:** <claude_done>/<claude_planned> stories completed
- **Rolled over:** <count> stories → Sprint <N+1>

### Epic Progress
- **<Epic Name>:** <closed_issues>/<total_issues> stories complete (<percentage>%)
- **Epic status:** <open/closed>

### Next Steps
1. **Review the release PR:** <link to PR>
2. **Merge to development** when satisfied
3. Run `/sprint-plan` to plan Sprint <N+1>
<If epic complete:>
4. Epic "<Epic Name>" is complete! Consider promoting development → main for a production release.
```

## Error Handling

- If no release branch exists, warn the user and suggest running `/sprint-plan` first
- If CI is failing on the release branch, flag prominently and do not open PR
- If there are no completed stories, ask the user if they want to cancel the sprint instead
- Always preserve incomplete work — never close issues that aren't done
