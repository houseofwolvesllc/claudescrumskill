---
name: project-scaffold
description: Scaffold a complete GitHub Project from PRD or spec documents. Creates the project board with custom fields and views, milestones for each phase, issues for every story with proper labels and dependencies, and sets up the branch strategy. Use when starting a new project, onboarding a new PRD, or bootstrapping a GitHub Project structure from requirements documents.
allowed-tools: Bash, Read, Write, Glob, Grep
argument-hint: <path-to-prd-or-spec-files>
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

## Scaffolding Procedure

### Step 1: Parse the PRD

Extract from the documents:
- Project name and description
- Phases/milestones (ordered)
- User stories per phase with acceptance criteria
- Dependencies between stories
- Any technical architecture notes

### Step 2: Create Labels

Create all labels defined in CONVENTIONS.md on the target repo:

```bash
# Executor labels
gh label create "executor:claude" --color 0E8A16 --description "Claude Code handles this" --repo <owner/repo>
gh label create "executor:human" --color 1D76DB --description "Requires human judgment" --repo <owner/repo>
gh label create "executor:cowork" --color D4C5F9 --description "Cowork agent task" --repo <owner/repo>

# Status signal labels
gh label create "ready-for-work" --color 0E8A16 --repo <owner/repo>
gh label create "needs-context" --color FBCA04 --repo <owner/repo>
gh label create "blocked" --color B60205 --repo <owner/repo>
gh label create "deferred" --color D93F0B --repo <owner/repo>
gh label create "rolled-over" --color E99695 --repo <owner/repo>

# Type labels
gh label create "type:story" --color C2E0C6 --repo <owner/repo>
gh label create "type:bug" --color D73A4A --repo <owner/repo>
gh label create "type:spike" --color D4C5F9 --repo <owner/repo>
gh label create "type:infra" --color 0075CA --repo <owner/repo>
gh label create "type:chore" --color FEF2C0 --repo <owner/repo>

# Priority labels
gh label create "P0-critical" --color B60205 --repo <owner/repo>
gh label create "P1-high" --color D93F0B --repo <owner/repo>
gh label create "P2-medium" --color FBCA04 --repo <owner/repo>
gh label create "P3-low" --color 0E8A16 --repo <owner/repo>

# Phase labels (one per PRD phase)
# gh label create "phase:<N>" --color <color> --repo <owner/repo>
```

### Step 3: Create Milestones

For each phase in the PRD:

```bash
gh api repos/<owner/repo>/milestones -f title="Phase N: <Phase Name>" -f description="<Phase summary from PRD>" -f state="open"
```

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

# Create release branch for the first phase/sprint
git checkout -b release/<first-milestone-slug>
git push -u origin release/<first-milestone-slug>
```

### Step 8: Configure Branch Protection

Attempt to set branch protection rules as defined in CONVENTIONS.md. If permissions are insufficient, output the recommended settings for the user to configure manually.

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
- Release branch: release/<slug> (created)
- Branch protection: <configured/manual setup needed>

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
