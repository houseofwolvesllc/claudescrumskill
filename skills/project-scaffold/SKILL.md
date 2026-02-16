---
name: project-scaffold
description: Scaffold a complete GitHub Project from PRD or spec documents. Creates the project board with custom fields and views, milestones for each phase, issues for every story with proper labels and dependencies, and sets up the branch strategy. Use when starting a new project, onboarding a new PRD, or bootstrapping a GitHub Project structure from requirements documents.
---

# Project Scaffold

Scaffold a complete GitHub Project from one or more PRD or spec documents.

## Before You Start

1. Read `references/CONVENTIONS.md` in this skill's directory for all project management standards including label taxonomy, branch strategy, issue templates, custom fields, and executor assignment guidelines. Follow these conventions exactly.
2. Confirm the `gh` CLI is authenticated by running `gh auth status`.
3. Identify the target repository. If the user doesn't specify, ask which repo to use.

## Input

The user provides `$ARGUMENTS` which should be one or more file paths to PRD or spec documents (markdown, text, or similar). If no arguments are provided, ask the user to specify the PRD location.

Read all provided documents thoroughly before proceeding.

## Scaffold Procedure

Execute these steps in order:

### Step 1: Parse the PRD

Extract the following from the PRD document(s):

- **Project name** — used for the GitHub Project title
- **Phases** — major sections of work, each becomes a milestone
- **Requirements/features** — individual items that become stories
- **Dependencies** — relationships between features
- **Any existing technical context** — architecture decisions, tech stack, constraints

Present a summary to the user:
```
Project: <name>
Phases identified: <count>
  - Phase 1: <name> (<estimated story count> stories)
  - Phase 2: <name> (<estimated story count> stories)
  ...
Total stories: <count>
```

Ask the user to confirm or adjust before proceeding.

### Step 2: Create Labels

Check which labels already exist in the repo. Create any missing labels from the taxonomy defined in CONVENTIONS.md:

```bash
# Check existing labels
gh label list --repo <owner/repo> --json name --jq '.[].name'

# Create missing labels (examples)
gh label create "executor:claude" --color "1d76db" --description "Claude Code handles implementation" --repo <owner/repo>
gh label create "executor:human" --color "e4e669" --description "Requires human judgment" --repo <owner/repo>
gh label create "executor:cowork" --color "c2e0c6" --description "Suitable for Cowork/Chrome agent" --repo <owner/repo>
gh label create "ready-for-work" --color "0e8a16" --description "Fully specced and unblocked" --repo <owner/repo>
gh label create "needs-context" --color "fbca04" --description "Missing information" --repo <owner/repo>
gh label create "blocked" --color "d93f0b" --description "Blocked by another issue" --repo <owner/repo>
gh label create "deferred" --color "cccccc" --description "Pushed to future sprint" --repo <owner/repo>
gh label create "rolled-over" --color "f9d0c4" --description "Incomplete from previous sprint" --repo <owner/repo>
gh label create "type:story" --color "5319e7" --repo <owner/repo>
gh label create "type:bug" --color "d73a4a" --repo <owner/repo>
gh label create "type:spike" --color "0075ca" --repo <owner/repo>
gh label create "type:infra" --color "006b75" --repo <owner/repo>
gh label create "type:chore" --color "ededed" --repo <owner/repo>
gh label create "P0-critical" --color "b60205" --repo <owner/repo>
gh label create "P1-high" --color "d93f0b" --repo <owner/repo>
gh label create "P2-medium" --color "fbca04" --repo <owner/repo>
gh label create "P3-low" --color "0e8a16" --repo <owner/repo>
```

### Step 3: Create Milestones

Create a milestone for each phase:

```bash
gh api repos/<owner/repo>/milestones -f title="Phase 1: <Phase Name>" -f description="<Phase summary from PRD>" -f state="open"
```

Capture the milestone number returned for each, as it's needed when creating issues.

### Step 4: Create the GitHub Project

```bash
# Create the project (org-level or user-level depending on repo ownership)
gh project create --owner <owner> --title "<Project Name>"
```

Note the project number returned. Then configure custom fields as defined in CONVENTIONS.md. Use the GraphQL API via `gh api graphql` to add:
- Status (single select with values: Backlog, Ready, In Progress, In Review, Done)
- Priority (single select with values: P0-Critical, P1-High, P2-Medium, P3-Low)
- Executor (single select with values: claude, human, cowork)
- Story Points (number field)
- Phase (single select with values derived from PRD phases)
- Sprint (iteration field with 2-week cycles)

### Step 5: Create Issues

For each story extracted from the PRD, create an issue following the template in CONVENTIONS.md:

```bash
gh issue create \
  --repo <owner/repo> \
  --title "<Story title>" \
  --body "<Issue body from template>" \
  --label "type:story,executor:<type>,<priority>,ready-for-work" \
  --milestone "<Phase N: Phase Name>"
```

For each issue:
- Assign executor label based on the executor assignment guidelines in CONVENTIONS.md
- Assign priority based on PRD emphasis and dependencies
- Assign to the correct milestone
- Estimate story points based on the guidelines in CONVENTIONS.md
- Note dependencies in the issue body

After creating issues, add them to the GitHub Project and set their custom field values.

### Step 6: Link Dependencies

For any stories with dependencies, add cross-references:
- Edit blocking issues to mention "Blocks #<number>" in the body
- Edit blocked issues to mention "Blocked by #<number>" in the body

### Step 7: Create Branch Structure

```bash
# Ensure main is up to date
git checkout main && git pull

# Create development branch if it doesn't exist
if ! git ls-remote --heads origin development | grep -q development; then
  git checkout -b development
  git push -u origin development
else
  git checkout development && git pull
fi

# Create release branch for the first phase/sprint off development
git checkout -b release/<first-milestone-slug>
git push -u origin release/<first-milestone-slug>
```

### Step 8: Configure Branch Protection (if user has admin access)

Attempt to set branch protection rules as defined in CONVENTIONS.md. Note the three-tier model:

- **main** — human-only write access, require PR reviews, gh PAT has NO bypass
- **development** — require status checks, require PR reviews for release merges
- **release/*** — require status checks, allow auto-merge when CI passes

If permissions are insufficient, output the recommended settings for the user to configure manually. In particular, emphasize that the gh PAT must NOT be granted write bypass on main — this is a deliberate security boundary.

### Step 9: Generate Summary

Output a complete summary:

```
## Project Scaffold Complete

**Project:** <name>
**Repository:** <owner/repo>
**Project Board:** <link to GitHub Project>

### Milestones
- Phase 1: <name> — <N> stories, <total points> points
- Phase 2: <name> — <N> stories, <total points> points
...

### Story Breakdown by Executor
- executor:claude — <N> stories (<points> points)
- executor:human — <N> stories (<points> points)  
- executor:cowork — <N> stories (<points> points)

### Branch Structure
- Development branch: development (created)
- Release branch: release/<slug> (created from development)
- Branch protection: <configured/manual setup needed>
- NOTE: Ensure main branch protection excludes the gh PAT from write access

### Next Steps
1. Review the project board: <link>
2. Adjust priorities and sprint assignments as needed
3. Run `/sprint-plan` to plan the first sprint iteration
4. Start work with `/sprint-status` to monitor progress
```

## Error Handling

- If `gh` is not authenticated, provide instructions: `gh auth login`
- If the repo doesn't exist, ask the user to create it or specify the correct repo
- If label creation fails (label exists), skip silently
- If project creation fails, check if user has appropriate permissions
- Always capture and report issue numbers for cross-referencing
