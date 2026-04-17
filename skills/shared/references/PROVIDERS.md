# Provider API Reference

This document maps project management operations to provider-specific API
calls. Skills reference this file when operating in remote mode (GitHub, Jira,
or Trello).

## Authentication

### GitHub

Requires `gh` CLI authenticated via `gh auth login`.

No environment variables needed — `gh` manages credentials internally.

### Jira

Requires three environment variables:

| Variable | Description | Example |
|---|---|---|
| `JIRA_SITE` | Atlassian site URL (no trailing slash) | `https://yourcompany.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email | `user@example.com` |
| `JIRA_API_TOKEN` | API token from id.atlassian.com | `ATATT3x...` |

Generate a token at: Settings > Atlassian Account > Security > API Tokens

All requests use Basic auth:
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$JIRA_SITE/rest/api/3/..."
```

### Trello

Requires two environment variables:

| Variable | Description | Example |
|---|---|---|
| `TRELLO_API_KEY` | API key from trello.com/power-ups/admin | `a1b2c3d4...` |
| `TRELLO_TOKEN` | Auth token (generated via authorize URL) | `e5f6g7h8...` |

All requests pass credentials as query parameters:
```bash
curl -s "https://api.trello.com/1/...?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"
```

---

## Auth Verification

| Operation | GitHub | Jira | Trello |
|---|---|---|---|
| Check auth | `gh auth status` | `curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_SITE/rest/api/3/myself"` | `curl -s "https://api.trello.com/1/members/me?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"` |

---

## Epic Operations

Epics map to different concepts per provider:

| Concept | GitHub | Jira | Trello |
|---|---|---|---|
| Epic container | Milestone | Epic issue type (or Version) | List |

### Create Epic

**GitHub:**
```bash
gh api repos/<owner/repo>/milestones \
  -f title="<Epic Name>" \
  -f description="<description>" \
  -f state="open"
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$JIRA_SITE/rest/api/3/issue" \
  -d '{
    "fields": {
      "project": {"key": "<PROJECT_KEY>"},
      "summary": "<Epic Name>",
      "description": {"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"<description>"}]}]},
      "issuetype": {"name": "Epic"}
    }
  }'
```

**Trello:**
```bash
curl -s -X POST "https://api.trello.com/1/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<Epic Name>&idBoard=<board-id>&pos=bottom"
```

### List Open Epics

**GitHub:**
```bash
gh api repos/<owner/repo>/milestones \
  --jq '.[] | select(.state=="open") | {number, title, open_issues, closed_issues}'
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/search?jql=project=<KEY>+AND+issuetype=Epic+AND+status!=Done&fields=summary,status"
```

**Trello:**
```bash
curl -s "https://api.trello.com/1/boards/<board-id>/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&filter=open"
```

### Close Epic

**GitHub:**
```bash
gh api repos/<owner/repo>/milestones/<number> -X PATCH -f state="closed"
```

**Jira:**
```bash
# Transition the epic to Done (get transition ID first)
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X POST "$JIRA_SITE/rest/api/3/issue/<epic-key>/transitions" \
  -H "Content-Type: application/json" \
  -d '{"transition":{"id":"<done-transition-id>"}}'
```

**Trello:**
```bash
curl -s -X PUT "https://api.trello.com/1/lists/<list-id>/closed?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&value=true"
```

---

## Story/Issue Operations

| Concept | GitHub | Jira | Trello |
|---|---|---|---|
| Story | Issue | Issue (Story type) | Card |

### Create Story

**GitHub:**
```bash
gh issue create --repo <owner/repo> \
  --title "<title>" \
  --body "<body>" \
  --label "type:story,executor:<type>,<priority>,epic:<slug>" \
  --milestone "<Epic Name>"
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$JIRA_SITE/rest/api/3/issue" \
  -d '{
    "fields": {
      "project": {"key": "<PROJECT_KEY>"},
      "summary": "<title>",
      "description": {"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"<body>"}]}]},
      "issuetype": {"name": "Story"},
      "labels": ["executor:<type>", "<priority>"],
      "customfield_<epic-link>": "<epic-key>"
    }
  }'
```

Note: The epic link custom field ID varies per Jira instance. Discover it via:
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_SITE/rest/api/3/field" | jq '.[] | select(.name=="Epic Link")'
```

**Trello:**
```bash
curl -s -X POST "https://api.trello.com/1/cards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<title>&desc=<body>&idList=<list-id>&idLabels=<label-ids>"
```

### List Stories

**GitHub:**
```bash
gh issue list --repo <owner/repo> --state open --label "type:story" \
  --json number,title,labels,milestone
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/search?jql=project=<KEY>+AND+issuetype=Story+AND+status!=Done&fields=summary,status,labels,priority,customfield_<points>"
```

**Trello:**
```bash
curl -s "https://api.trello.com/1/lists/<list-id>/cards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&fields=name,desc,labels,idMembers"
```

### Update Story Status

**GitHub:**
```bash
# Close
gh issue close <number> --repo <owner/repo>
# Reopen
gh issue reopen <number> --repo <owner/repo>
```

**Jira:**
```bash
# Get available transitions
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/issue/<issue-key>/transitions"

# Apply transition
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X POST "$JIRA_SITE/rest/api/3/issue/<issue-key>/transitions" \
  -H "Content-Type: application/json" \
  -d '{"transition":{"id":"<transition-id>"}}'
```

**Trello:**
```bash
# Move card to a different list (e.g., Done list)
curl -s -X PUT "https://api.trello.com/1/cards/<card-id>?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "idList=<done-list-id>"
```

### Add/Remove Labels

**GitHub:**
```bash
gh issue edit <number> --repo <owner/repo> --add-label "<label>"
gh issue edit <number> --repo <owner/repo> --remove-label "<label>"
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X PUT "$JIRA_SITE/rest/api/3/issue/<issue-key>" \
  -H "Content-Type: application/json" \
  -d '{"update":{"labels":[{"add":"<label>"}]}}'
```

**Trello:**
```bash
# Add label
curl -s -X POST "https://api.trello.com/1/cards/<card-id>/idLabels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&value=<label-id>"
# Remove label
curl -s -X DELETE "https://api.trello.com/1/cards/<card-id>/idLabels/<label-id>?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN"
```

### Read Story Details

**GitHub:**
```bash
gh issue view <number> --repo <owner/repo> --json number,title,body,labels,milestone,state
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/issue/<issue-key>?fields=summary,description,status,labels,priority"
```

**Trello:**
```bash
curl -s "https://api.trello.com/1/cards/<card-id>?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&fields=name,desc,labels,idList,closed"
```

---

## Label Operations

### Create Label

**GitHub:**
```bash
gh label create "<name>" --color "<hex>" --description "<desc>" --repo <owner/repo>
```

**Jira:**
```bash
# Jira labels are created implicitly when applied to an issue.
# No separate create call needed.
```

**Trello:**
```bash
curl -s -X POST "https://api.trello.com/1/boards/<board-id>/labels?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<name>&color=<color>"
```

Note: Trello has a fixed set of label colors: `green`, `yellow`, `orange`,
`red`, `purple`, `blue`, `sky`, `lime`, `pink`, `black`, `null` (no color).

---

## Sprint Operations

| Concept | GitHub | Jira | Trello |
|---|---|---|---|
| Sprint | Iteration field on Project | Sprint (Scrum board) | Convention: use lists named "Sprint N" |

### Create/Start Sprint

**GitHub:**
```bash
# Create via GraphQL — add an iteration to the Sprint field
gh api graphql -f query='mutation { ... }'
```

**Jira:**
```bash
# Get board ID
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/agile/1.0/board?projectKeyOrId=<KEY>"

# Create sprint
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X POST "$JIRA_SITE/rest/agile/1.0/sprint" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint <N>",
    "startDate": "<ISO date>",
    "endDate": "<ISO date>",
    "originBoardId": <board-id>,
    "goal": "<sprint goal>"
  }'
```

**Trello:**
```bash
# Create a "Sprint N" list at the top of the board
curl -s -X POST "https://api.trello.com/1/lists?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=Sprint <N>&idBoard=<board-id>&pos=top"
```

### Assign Story to Sprint

**GitHub:**
```bash
# Update the Sprint iteration field via GraphQL
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(...) }'
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X POST "$JIRA_SITE/rest/agile/1.0/sprint/<sprint-id>/issue" \
  -H "Content-Type: application/json" \
  -d '{"issues":["<issue-key>"]}'
```

**Trello:**
```bash
# Move card to the sprint list
curl -s -X PUT "https://api.trello.com/1/cards/<card-id>?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "idList=<sprint-list-id>"
```

### Complete Sprint

**GitHub:**
```bash
# No explicit close — the iteration just ends by date
```

**Jira:**
```bash
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X POST "$JIRA_SITE/rest/agile/1.0/sprint/<sprint-id>" \
  -H "Content-Type: application/json" \
  -d '{"state":"closed"}'
```

**Trello:**
```bash
# Archive the sprint list
curl -s -X PUT "https://api.trello.com/1/lists/<sprint-list-id>/closed?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN&value=true"
```

---

## Project/Board Operations

### Create Project/Board

**GitHub:**
```bash
gh project create --owner <owner> --title "<name>"
```

**Jira:**
```bash
# Get the current user's account ID
ACCOUNT_ID=$(curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_SITE/rest/api/3/myself" | jq -r '.accountId')

# Create a Scrum software project (preferred template)
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X POST "$JIRA_SITE/rest/api/3/project" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "<PROJECT_KEY>",
    "name": "<name>",
    "projectTypeKey": "software",
    "projectTemplateKey": "com.pyxis.greenhopper.jira:gh-scrum-template",
    "leadAccountId": "'$ACCOUNT_ID'"
  }'
```
The Scrum template auto-creates a Scrum board with backlog and sprint support.
Save the project key to `config.json` after creation.

**Trello:**
```bash
# Create board with no default lists (skill creates its own)
curl -s -X POST "https://api.trello.com/1/boards?key=$TRELLO_API_KEY&token=$TRELLO_TOKEN" \
  -d "name=<name>&defaultLists=false"
```
Save the board ID from the response to `config.json` after creation.

---

## PR / Code Review Operations

These are git-host-specific. Jira and Trello do not have native PR
functionality — PRs live in the git host (GitHub, Bitbucket, GitLab).

When using Jira or Trello as the project tracker with GitHub as the git host,
PR operations still use `gh`:

```bash
gh pr create --repo <owner/repo> --base <base> --head <head> --title "<title>" --body "<body>"
gh pr merge <number> --repo <owner/repo> --squash
```

If not using GitHub for git hosting, replace with direct git merges (same as
local mode):

```bash
git checkout <base> && git merge <head> --no-ff -m "<message>"
git push origin <base>
```

---

## Provider Limitations

### Jira
- Epic link custom field ID varies per instance — must be discovered at runtime
- Transitions (status changes) require knowing the transition ID — query available transitions first
- Jira Cloud rate limits: 100 requests/minute for most endpoints
- Description uses Atlassian Document Format (ADF), not plain markdown

### Trello
- No native sprint concept — sprints are modeled as lists
- No native story points — requires custom fields power-up
- Limited label colors (10 fixed options)
- No native issue dependencies — use checklist items or card links
- Cards don't have a "closed with resolution" concept — archived or moved to Done list
- Rate limit: 100 requests per 10 seconds per token

### GitHub
- Project iteration fields require GraphQL for mutation
- Rate limit: 5000 requests/hour for authenticated requests
- Fine-grained PATs require explicit repo and permission scoping
