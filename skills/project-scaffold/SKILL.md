---
name: project-scaffold
description: Scaffold a complete GitHub Project from PRD or spec documents, or add stories to an existing project and epic. Creates the project board with custom fields and views, epics (milestones) for each body of work, issues for every story with proper labels and dependencies, and sets up the branch strategy. Use when starting a new project, onboarding a new PRD, or adding stories to an existing epic.
---

# Project Scaffold

Scaffold a complete GitHub Project from one or more PRD or spec documents, or add stories to an existing project.

## Before You Start

1. Read `references/CONVENTIONS.md` in this skill's directory for all project management standards including label taxonomy, branch strategy, issue templates, custom fields, and executor assignment guidelines. Follow these conventions exactly.
2. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in GitHub API commands and code — never in communication with the user.
3. Confirm the `gh` CLI is authenticated by running `gh auth status`.
4. Identify the target repository. If the user doesn't specify, ask which repo to use.

## Input

The user provides `$ARGUMENTS` which should be one or more file paths to PRD or spec documents (markdown, text, or similar). If no arguments are provided, ask the user to specify the PRD location.

Read all provided documents thoroughly before proceeding.

## Scaffold Procedure

Execute these steps in order:

### Step 0: Detect Existing Project Context

Before scaffolding from scratch, check if the repository already has an active project:

```bash
# Check for existing milestones (epics)
gh api repos/<owner/repo>/milestones --jq '.[] | select(.state=="open") | {number, title, open_issues, closed_issues, description}'

# Check for existing GitHub Projects
gh project list --owner <owner> --format json

# Check for existing labels
gh label list --repo <owner/repo> --json name --jq '.[].name'
```

**If existing epics (milestones) or a project board are found**, present the user with options:

```
Existing project detected:
  Project: <project name> (#<number>)
  Open Epics:
    - <Epic 1 title> (N open / M closed issues)
    - <Epic 2 title> (N open / M closed issues)
    ...

How should the PRD stories be added?
  1. Create new epic(s) from this PRD
  2. Add stories to an existing epic (select from list above)
  3. Mix — map each PRD section to a new or existing epic
```

Ask the user to choose and, if option 2 or 3, which epic(s) to target.

**If no existing project is found**, proceed with the full scaffold flow (Steps 1-9).

**Backward compatibility:** Existing milestones named `Phase N: <Name>` are treated as epics. Do not rename them.

### Step 1: Parse the PRD

Extract the following from the PRD document(s):

- **Project name** — used for the GitHub Project title (if creating new)
- **Epics** — major bodies of work; each becomes a milestone (unless mapped to an existing one)
- **Requirements/features** — individual items that become stories
- **Dependencies** — relationships between features (including references to existing issues)
- **Any existing technical context** — architecture decisions, tech stack, constraints

Present a summary to the user:
```
Project: <name>
Epics identified: <count>
  - <Epic Name> (<estimated story count> stories) → [NEW / existing: "<milestone title>"]
  - <Epic Name> (<estimated story count> stories) → [NEW / existing: "<milestone title>"]
  ...
Total stories: <count>
```

Ask the user to confirm or adjust before proceeding.

### Step 2: Create Labels

Check which labels already exist in the repo. Create only the missing labels from the taxonomy defined in CONVENTIONS.md:

```bash
# Check existing labels
gh label list --repo <owner/repo> --json name --jq '.[].name'

# Create missing labels (skip any that already exist)
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

### Step 3: Create Epics (Milestones)

For each **new** epic identified in the PRD (skip any mapped to existing milestones):

```bash
gh api repos/<owner/repo>/milestones -f title="<Epic Name>" -f description="<Epic summary from PRD>" -f state="open"
```

Capture the milestone number returned for each, as it's needed when creating issues. For existing epics, use their existing milestone number.

### Step 4: Create the GitHub Project

**If a project already exists**, skip creation and capture the existing project number.

**If no project exists:**

```bash
# Create the project (org-level or user-level depending on repo ownership)
gh project create --owner <owner> --title "<Project Name>"
```

Note the project number returned. Then configure custom fields as defined in CONVENTIONS.md. Use the GraphQL API via `gh api graphql` to add:
- Status (single select with values: Backlog, Ready, In Progress, In Review, Done)
- Priority (single select with values: P0-Critical, P1-High, P2-Medium, P3-Low)
- Executor (single select with values: claude, human, cowork)
- Story Points (number field)
- Sprint (iteration field with 2-week cycles)

### Step 5: Create Issues

For each story extracted from the PRD, create an issue following the template in CONVENTIONS.md:

```bash
gh issue create \
  --repo <owner/repo> \
  --title "<Story title>" \
  --body "<Issue body from template>" \
  --label "type:story,executor:<type>,<priority>,ready-for-work" \
  --milestone "<Epic Name>"
```

For each issue:
- Assign executor label based on the executor assignment guidelines in CONVENTIONS.md
- Assign priority based on PRD emphasis and dependencies
- Assign to the correct epic (milestone) — either new or existing
- Estimate story points based on the guidelines in CONVENTIONS.md
- Note dependencies in the issue body (can reference both new and pre-existing issue numbers)

After creating issues, add them to the GitHub Project and set their custom field values.

### Step 6: Link Dependencies

For any stories with dependencies, add cross-references:
- Edit blocking issues to mention "Blocks #<number>" in the body
- Edit blocked issues to mention "Blocked by #<number>" in the body
- This includes dependencies on pre-existing issues in the repo

### Step 7: Create Branch Structure

**Skip any branches that already exist.**

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

# Create release branch for each new epic (skip if already exists)
for epic_slug in <new-epic-slugs>; do
  if ! git ls-remote --heads origin release/$epic_slug | grep -q release/$epic_slug; then
    git checkout development
    git checkout -b release/$epic_slug
    git push -u origin release/$epic_slug
  fi
done
```

### Step 8: Configure Branch Protection (if user has admin access)

**Skip if branch protection is already configured.**

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
**Mode:** <Fresh scaffold / Added to existing project>

### Epics
- <Epic Name> — <N> stories, <total points> points [NEW]
- <Epic Name> — <N> stories added, <total points> points [EXISTING — now N total stories]
...

### Story Breakdown by Executor
- executor:claude — <N> stories (<points> points)
- executor:human — <N> stories (<points> points)
- executor:cowork — <N> stories (<points> points)

### Branch Structure
- Development branch: development (created/exists)
- Release branches: release/<slug> (created/exists)
- Branch protection: <configured/manual setup needed>
- NOTE: Ensure main branch protection excludes the gh PAT from write access

### Next Steps
1. Review the project board: <link>
2. Adjust priorities and sprint assignments as needed
3. Run `/sprint-plan` to plan the next sprint iteration
4. Start work with `/sprint-status` to monitor progress
```

## Error Handling

- If `gh` is not authenticated, provide instructions: `gh auth login`
- If the repo doesn't exist, ask the user to create it or specify the correct repo
- If label creation fails (label exists), skip silently
- If project creation fails, check if user has appropriate permissions
- Always capture and report issue numbers for cross-referencing
