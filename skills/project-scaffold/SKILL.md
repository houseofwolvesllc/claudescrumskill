---
name: project-scaffold
description: Scaffold a complete GitHub Project from PRD or spec documents, or add stories to an existing project and epic. Creates the project board with custom fields and views, epics (milestones) for each body of work, issues for every story with proper labels and dependencies, and sets up the branch strategy. Use when starting a new project, onboarding a new PRD, or adding stories to an existing epic.
---

# Project Scaffold

Scaffold a complete GitHub Project from one or more PRD or spec documents, or add stories to an existing project.

## Before You Start

1. Read `../shared/references/CONVENTIONS.md` for all project management standards including label taxonomy, branch strategy, issue templates, custom fields, and executor assignment guidelines. Follow these conventions exactly.
2. Read `../shared/config.json` to determine the scaffolding mode (`scaffolding` key: `"local"`, `"github"`, `"jira"`, or `"trello"`, default: `"local"`). If `"local"`, also read the `paths.backlog` value (default: `.claude-scrum-skill/backlog`).
3. Read `../shared/references/PROVIDERS.md` for provider-specific API commands when operating in remote mode (GitHub, Jira, or Trello).
4. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in API commands and code — never in communication with the user.
5. **If `scaffolding: "github"`:** Confirm the `gh` CLI is authenticated by running `gh auth status`. Identify the target repository. If the user doesn't specify, ask which repo to use.
6. **If `scaffolding: "jira"`:** Verify `JIRA_SITE`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` environment variables are set. Read `jira.project_key` from config.json. Verify auth per PROVIDERS.md.
7. **If `scaffolding: "trello"`:** Verify `TRELLO_API_KEY` and `TRELLO_TOKEN` environment variables are set. Read `trello.board_id` from config.json. Verify auth per PROVIDERS.md.
8. **If `scaffolding: "local"`:** Skip authentication. No external service required — the backlog is file-based.

## Input

The user provides `$ARGUMENTS` which should be one or more file paths to PRD or spec documents (markdown, text, or similar). If no arguments are provided, ask the user to specify the PRD location.

Read all provided documents thoroughly before proceeding.

## Scaffold Procedure

Read `../shared/config.json` to determine mode. If `scaffolding` is `"local"`,
follow the **Local Scaffold Procedure** below. Otherwise follow the
**GitHub Scaffold Procedure**.

---

## Local Scaffold Procedure

When `scaffolding: "local"`, create the entire backlog as local markdown files
instead of GitHub issues, milestones, and project boards.

### Local Step 1: Parse the PRD

Same as GitHub Step 1 — extract project name, epics, stories, dependencies,
and technical context. Present the summary and ask the user to confirm.

### Local Step 2: Detect Existing Backlog

Check if the configured backlog directory already exists:

```bash
ls <backlog-path>/PROJECT.md 2>/dev/null
```

**If found**, read `PROJECT.md` and list existing epic directories. Present
options (same as GitHub mode):

```
Existing local backlog detected:
  Project: <name>
  Epics:
    - <epic-slug>/ (N stories)
    ...

How should the PRD stories be added?
  1. Create new epic(s) from this PRD
  2. Add stories to an existing epic
  3. Mix — map each PRD section to a new or existing epic
```

**If not found**, proceed with full scaffold.

### Local Step 3: Create Project File

Create `<backlog-path>/PROJECT.md`:

```markdown
---
name: <Project Name>
created: <ISO timestamp>
sprints: []
---

# <Project Name>

<Project description from PRD>
```

### Local Step 4: Create Epic Directories

For each epic, create `<backlog-path>/<epic-slug>/`:

```markdown
<!-- <backlog-path>/<epic-slug>/_epic.md -->
---
title: <Epic Name>
slug: <epic-slug>
status: open
created: <ISO timestamp>
---

# <Epic Name>

<Epic description from PRD>
```

### Local Step 5: Create Story Files

For each story, create a numbered file in the epic directory. Use sequential
numbering within each epic: `001-<story-slug>.md`, `002-<story-slug>.md`, etc.

```markdown
<!-- <backlog-path>/<epic-slug>/001-<story-slug>.md -->
---
title: <Story title>
epic: <epic-slug>
status: backlog
executor: claude | human | cowork
priority: P0-critical | P1-high | P2-medium | P3-low
points: <fibonacci estimate>
labels:
  - type:story
  - executor:<type>
  - <priority>
  - epic:<epic-slug>
  - ready-for-work
persona: impl | ops | research
blocked_by: []
blocks: []
sprint: null
---

## Objective

<What this accomplishes — one clear sentence>

## Acceptance Criteria

- [ ] <Specific, testable criterion>
- [ ] <Specific, testable criterion>

## Technical Context

<Architecture notes, relevant files, approach guidance>

## Dependencies

- **Blocked by:** <epic-slug>/NNN-slug or "none">
- **Blocks:** <epic-slug>/NNN-slug or "none">
```

Use the same executor assignment and story point guidelines from
CONVENTIONS.md as in GitHub mode.

### Local Step 6: Generate Summary

```
## Project Scaffold Complete (Local Mode)

**Project:** <name>
**Backlog path:** <backlog-path>/
**Mode:** Local file-based backlog

### Epics
- <epic-slug>/ — <N> stories, <total points> points
...

### Story Breakdown by Executor
- executor:claude — <N> stories (<points> points)
- executor:human — <N> stories (<points> points)
- executor:cowork — <N> stories (<points> points)

### Next Steps
1. Review stories in <backlog-path>/
2. Adjust priorities, executors, or points by editing frontmatter
3. Note: Sprint planning, status tracking, and orchestration currently
   require `scaffolding: "github"`. Set that in config.json and run
   `/project-scaffold` again to push the backlog to GitHub when ready.
```

**No branches, labels, or GitHub Project are created in local mode.**

---

## Jira Scaffold Procedure

When `scaffolding: "jira"`, use the Jira REST API to create epics, stories,
and sprints. Refer to `../shared/references/PROVIDERS.md` for all API calls.

### Jira Step 1: Parse the PRD

Same as Local Step 1 / GitHub Step 1.

### Jira Step 2: Ensure Project Exists

Read `jira.project_key` from `../shared/config.json`.

**If the key is empty or not set**, create the project:

```bash
# Get the current user's account ID for project lead
ACCOUNT_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/myself" | jq -r '.accountId')

# Derive a project key from the PRD project name (uppercase, max 10 chars)
PROJECT_KEY=$(echo "<Project Name>" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z' | head -c 10)

# Create a Scrum software project
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$JIRA_SITE/rest/api/3/project" \
  -d '{
    "key": "'$PROJECT_KEY'",
    "name": "<Project Name>",
    "projectTypeKey": "software",
    "projectTemplateKey": "com.pyxis.greenhopper.jira:gh-scrum-template",
    "leadAccountId": "'$ACCOUNT_ID'"
  }'
```

After creation, save the key back to `../shared/config.json` under
`jira.project_key` so subsequent skills don't need to create it again.

**If the key is set**, verify the project exists and check for existing epics:

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/search?jql=project=<PROJECT_KEY>+AND+issuetype=Epic+AND+status!=Done&fields=summary,status"
```

If epics exist, present options to add to existing or create new (same UX as
GitHub mode).

### Jira Step 3: Create Epics

Create an Epic issue for each epic in the PRD. Capture the epic key returned.

### Jira Step 4: Create Stories

Create Story issues linked to their parent epic. Apply labels for executor,
priority, and persona. Set story points via the appropriate custom field.

Note: Discover the epic link field ID and story points field ID at runtime:
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_SITE/rest/api/3/field" \
  | jq '.[] | select(.name=="Epic Link" or .name=="Story Points")'
```

### Jira Step 5: Create Sprint

```bash
# Find the Scrum board for this project
BOARD_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/agile/1.0/board?projectKeyOrId=<PROJECT_KEY>" \
  | jq '.values[] | select(.type=="scrum") | .id')
```

If a Scrum board exists, use it. If the project was just created with the
Scrum template, the board is created automatically.

Create the first sprint on the board:

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$JIRA_SITE/rest/agile/1.0/sprint" \
  -d '{
    "name": "Sprint 1",
    "originBoardId": '$BOARD_ID',
    "goal": "<sprint goal from PRD>"
  }'
```

### Jira Step 6: Create Branch Structure

Same as GitHub mode — git operations are independent of the issue tracker.
Create `development` and `release/<epic-slug>` branches.

### Jira Step 7: Generate Summary

Same format as GitHub mode, replacing GitHub-specific links with Jira URLs:
- Project board: `$JIRA_SITE/jira/software/projects/<KEY>/boards/<id>`
- Epics: `$JIRA_SITE/browse/<EPIC-KEY>`

---

## Trello Scaffold Procedure

When `scaffolding: "trello"`, use the Trello REST API to create lists (epics),
cards (stories), and labels. Refer to `../shared/references/PROVIDERS.md` for
all API calls.

### Trello Step 1: Parse the PRD

Same as Local Step 1 / GitHub Step 1.

### Trello Step 2: Ensure Board Exists

Read `trello.board_id` from `../shared/config.json`.

**If the ID is empty or not set**, create the board:

```bash
# Create a new board with no default lists (we'll create our own)
BOARD_ID=$(curl -s -X POST "https://api.trello.com/1/boards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<Project Name>&defaultLists=false" | jq -r '.id')
```

After creation, save the board ID back to `../shared/config.json` under
`trello.board_id` so subsequent skills don't need to create it again.

**If the ID is set**, check for existing lists:

```bash
curl -s "https://api.trello.com/1/boards/<board-id>/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&filter=open"
```

If lists exist, present options to add to existing or create new (same UX as
GitHub mode).

### Trello Step 3: Create Labels

Trello has a fixed color palette. Map priority and executor labels:

```bash
# Create labels on the board
curl -s -X POST "https://api.trello.com/1/boards/<board-id>/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=executor:claude&color=blue"
curl -s -X POST "https://api.trello.com/1/boards/<board-id>/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=executor:human&color=yellow"
curl -s -X POST "https://api.trello.com/1/boards/<board-id>/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=P0-critical&color=red"
curl -s -X POST "https://api.trello.com/1/boards/<board-id>/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=P1-high&color=orange"
# ... etc
```

### Trello Step 4: Create Epic Lists

Create one list per epic. Position Backlog and Done lists at the edges:

```bash
curl -s -X POST "https://api.trello.com/1/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<Epic Name>&idBoard=<board-id>&pos=bottom"
```

### Trello Step 5: Create Story Cards

Create a card per story in the appropriate epic list:

```bash
curl -s -X POST "https://api.trello.com/1/cards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<title>&desc=<body with acceptance criteria>&idList=<epic-list-id>&idLabels=<label-ids>"
```

Story points: If custom fields power-up is enabled, set via:
```bash
curl -s -X PUT "https://api.trello.com/1/cards/<card-id>/customField/<field-id>/item?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":{"number":"<points>"}}'
```

Otherwise, prefix the card title: `[5] <Story title>`.

### Trello Step 6: Create Branch Structure

Same as GitHub mode — git operations are independent of the issue tracker.

### Trello Step 7: Generate Summary

Same format as GitHub mode, replacing links with Trello URLs.

**Trello limitations note:** Trello has no native sprints, dependencies, or
milestone progress tracking. These are managed via list naming conventions
and card descriptions. For full sprint lifecycle support, consider GitHub or
Jira mode.

---

## GitHub Scaffold Procedure

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

# Persona labels
gh label create "persona:ops" --color "1D76DB" --description "Ops/infra posture — idempotency, rollback, least privilege" --repo <owner/repo> 2>/dev/null
gh label create "persona:research" --color "D4C5F9" --description "Research posture — produce a document, not code" --repo <owner/repo> 2>/dev/null
gh label create "source:review" --color "BFDADC" --description "Issue created from automated review findings" --repo <owner/repo> 2>/dev/null
```

### Step 3: Create Epics (Milestones + Labels)

For each **new** epic identified in the PRD (skip any mapped to existing milestones):

```bash
# Create the milestone for progress tracking
gh api repos/<owner/repo>/milestones -f title="<Epic Name>" -f description="<Epic summary from PRD>" -f state="open"

# Create the epic label for visibility (slug = lowercase, hyphenated)
gh label create "epic:<epic-slug>" --color "7057ff" --description "<Epic Name>" --repo <owner/repo>
```

Capture the milestone number returned for each, as it's needed when creating issues. For existing epics, use their existing milestone number. If an existing epic has no corresponding `epic:*` label, create one.

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
  --label "type:story,executor:<type>,<priority>,ready-for-work,epic:<epic-slug>" \
  --milestone "<Epic Name>"
```

For each issue:
- Assign executor label based on the executor assignment guidelines in CONVENTIONS.md
- Assign priority based on PRD emphasis and dependencies
- Assign to the correct epic — both the `epic:<slug>` label and the milestone
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
