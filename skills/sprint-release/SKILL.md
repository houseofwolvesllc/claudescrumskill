---
name: sprint-release
description: Wrap up a sprint by generating a release summary, opening release PRs for human review, handling incomplete stories, cleaning up merged branches, and preparing for the next sprint. Use when a sprint is complete or at the sprint boundary deadline.
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

### Step 4: Detect Branch State

Before creating any PR, determine the current branch state:

```bash
git fetch origin

# Find all release and story branches
RELEASE_BRANCHES=$(git branch -r | grep 'origin/release/' | sed 's|origin/||' | xargs)
STORY_BRANCHES=$(git branch -r | grep 'origin/story/' | sed 's|origin/||' | xargs)

# Check which release branches have unmerged commits relative to development
UNMERGED=""
for branch in $RELEASE_BRANCHES; do
  AHEAD=$(git rev-list --count origin/development..origin/$branch 2>/dev/null || echo "0")
  if [ "$AHEAD" -gt 0 ]; then
    UNMERGED="$UNMERGED $branch"
  fi
done
```

Based on the result, follow the matching scenario:

**Scenario A — Unmerged release branches exist:**

Release branches have commits not yet in `development`. This is the "accumulate and release" pattern.

1. Create one PR per unmerged release branch targeting `development`
2. Do NOT create a `development` → `main` PR (that's a separate human-initiated production release)
3. Clean up only the story branches that are fully merged into their release branch

```bash
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

**Scenario B — All release branches already merged to development:**

All epic work was merged into `development` during sprint execution. Nothing to PR into `development`.

1. Check for an existing `development` → `main` PR
   - If one exists, update its body with the release notes
   - If none exists, create it
2. Clean up all merged story and release branches (both local and remote)

```bash
# Check for existing development → main PR
gh pr list --repo <owner/repo> --base main --head development --json number,state

# If no PR exists, create the production release PR
gh pr create \
  --repo <owner/repo> \
  --base main \
  --head development \
  --title "Release: Sprint <N> — <summary>" \
  --body "<release PR body from Step 3>" \
  --reviewer <owner> \
  --label "type:release"

# If a PR already exists, update its body with the release notes
gh api repos/<owner/repo>/pulls/<pr-number> -X PATCH -f body="<release PR body>"
```

**Scenario C — Mixed (some merged, some not):**

Some release branches were merged during sprint execution, others are still pending.

1. Create PRs for unmerged release branches → `development` (Scenario A behavior)
2. Do NOT create the `development` → `main` PR yet (pending work still needs to land)
3. Clean up only fully-merged branches

### Step 5: Clean Up Merged Branches

After handling the release PR(s), clean up branches that are fully merged into `development`. The skill that creates branches is NOT necessarily the skill that cleans them up — `project-scaffold` and `sprint-plan` create release/story branches, but `sprint-release` is responsible for cleaning up any that are fully merged by the time it runs.

```bash
# Identify merged branches (excluding main and development)
git branch -r --merged origin/development | grep -E 'origin/(story|release)/' | sed 's|origin/||'

# Delete remote branches
for branch in <merged-branches>; do
  git push origin --delete "$branch"
done

# Delete local tracking branches and prune
git branch -d <local-merged-branches>
git remote prune origin
```

**Cleanup rules:**
- Never delete `main` or `development`
- Only delete branches fully merged into `development`
- In Scenario A/C, only delete story branches merged into their release branch — do not delete unmerged release branches
- Report all deletions in the release summary

### Step 6: Close Epics (if all stories are complete)

If all stories in an epic (milestone) are complete (no open issues remaining):

```bash
gh api repos/<owner/repo>/milestones/<milestone-number> -f state="closed"
```

If stories remain, keep the epic open for the next sprint.

### Step 7: Generate Release Report

```
## Sprint <N> Release Complete

**Release PR:** #<pr-number> — awaiting your review
**Branch:** <branch flow description, e.g. "development → main" or "release/<slug> → development">

### Sprint Scorecard
- **Velocity:** <points_completed> points (target was <planned_points>)
- **Completion:** <percentage>% of planned stories
- **Claude efficiency:** <claude_done>/<claude_planned> stories completed
- **Rolled over:** <count> stories → Sprint <N+1>

### Epic Progress
- **<Epic Name>:** <closed_issues>/<total_issues> stories complete (<percentage>%)
- **Epic status:** <open/closed>

### Cleanup
- **Branches deleted:** <list of deleted branches, or "none">
- **Remaining branches:** main, development

### Next Steps
<If Scenario A (release → development):>
1. **Review the release PR:** <link to PR>
2. **Merge to development** when satisfied
3. Run `/sprint-plan` to plan Sprint <N+1>

<If Scenario B (development → main):>
1. **Review the production release PR:** <link to PR>
2. **Merge to main** when satisfied
3. Run `/sprint-plan` to plan the next phase
```

## Error Handling

- If no release branch exists, warn the user and suggest running `/sprint-plan` first
- If CI is failing on the release branch, flag prominently and do not open PR
- If there are no completed stories, ask the user if they want to cancel the sprint instead
- Always preserve incomplete work — never close issues that aren't done
