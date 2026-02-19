# Claude Scrum Skill

An open-source npm package of Claude Code skills that give you a complete scrum pipeline — from PRD to production release — with Claude as your scrum master. Includes project scaffolding, sprint planning, status tracking, sprint releases, and full-project emulation testing. One PR per sprint. You stay in the executive seat.

```
PRD → /project-scaffold → GitHub Project with sprints, stories, branches
                              ↓
                        /sprint-plan → populate the next sprint
                              ↓
                     Claude works stories → auto-merge to release branch
                              ↓
                       /sprint-status → check progress anytime
                              ↓
                      /sprint-release → wrap up sprint, open release PR
                              ↓
                     You review one PR → merge to development
                              ↓
                        /sprint-plan → next cycle
```

## Installation

### npm (recommended)

```bash
npm install -g @houseofwolvesllc/claude-scrum-skill
```

This copies all skills into `~/.claude/skills/`. All five skills are installed as siblings so relative paths to shared conventions resolve correctly.

### Manual

Clone the repo and copy the `skills/` contents into `~/.claude/skills/` (global) or `your-repo/.claude/skills/` (per-project). All skill directories must be siblings — `sprint-plan`, `sprint-status`, and `sprint-release` reference `../project-scaffold/references/CONVENTIONS.md` via relative path.

**Note:** After installing, restart Claude Code for the skills to become available.

## Quick Start

### 1. Create a Fine-Grained GitHub Personal Access Token

These skills use `gh` for all GitHub operations. You need a fine-grained PAT scoped to the repos you want to manage.

**Step 1:** Go to [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) and click **Generate new token**.

**Step 2:** Fill in the token details:
- **Token name** — Something descriptive like `claude-code-pm`
- **Expiration** — Set a reasonable window (90 days is a good default)
- **Resource owner** — Your account (or your org if the repos live there)
- **Repository access** — Select **Only select repositories**, then pick the repos these skills will manage

**Step 3:** Under **Permissions → Repository permissions**, grant:

| Permission | Access | Why |
|---|---|---|
| Contents | Read & Write | Create branches, push commits |
| Issues | Read & Write | Create and update stories on the project board |
| Metadata | Read | Required by GitHub for all fine-grained PATs |
| Pull requests | Read & Write | Open PRs for story branches and releases |

**Step 4:** Under **Permissions → Account permissions**, grant:

| Permission | Access | Why |
|---|---|---|
| Projects | Read & Write | Create project boards, custom fields, and views |

**Step 5:** Click **Generate token** and copy it immediately — you won't see it again.

**Step 6:** Authenticate the GitHub CLI with your new token:

```bash
echo "YOUR_TOKEN" | gh auth login --with-token
```

Verify it worked:

```bash
gh auth status
```

**Security tip:** Do not grant write access to your `main` branch via the token. Set up branch protection rules so merges to `main` always require your manual review. This is the gate that keeps you in control.

### 2. Write a PRD

Create a markdown file with your project requirements. The more structured, the better the scaffold. At minimum, include:
- Project name and description
- Epics or major bodies of work with clear boundaries
- User stories or features per epic
- Acceptance criteria for each story

### 3. Scaffold the Project

Open Claude Code in your repo and run:

```
/project-scaffold path/to/your-prd.md
```

This creates:
- A GitHub Project board with custom fields (Status, Sprint, Priority, Executor, Story Points)
- Board views: Current Sprint, Claude Queue, My Tasks, Backlog, Epic Overview
- Issues for every story, labeled with type, priority, executor, and `epic:<slug>`
- Epics tracked two ways: `epic:*` labels for visibility + milestones for progress tracking
- Release branches for each epic
- Branch protection on main

Already have an existing project? The skill detects it and offers to add stories to existing epics or create new ones — no need to scaffold from scratch every time.

### 4. Plan a Sprint

```
/sprint-plan owner/repo
```

The skill pulls stories from the backlog, assigns them to the next sprint iteration, and sets up the release branch. It respects your velocity target (default: 20 story points) and prioritizes by the Priority field.

### 5. Assign an Executor

Three executor labels control who works each story:

| Label | Who | When |
|---|---|---|
| `executor:claude` | Claude Code | Clear implementation path, no human judgment needed |
| `executor:human` | You | Business decisions, credentials, external approvals |
| `executor:cowork` | Cowork agent | Research, drafting, web-based tasks |

### 6. Hand Off to Claude Code

In Claude Code, tell it to work the sprint:

> "Pick up the current sprint. Work through all stories labeled executor:claude in priority order. For each story, create a feature branch off the release branch, implement, open a PR back to the release branch, and move the issue to Done."

Claude works autonomously — branching, committing, opening PRs with auto-merge to the release branch.

### 7. Check Progress

```
/sprint-status owner/repo
```

Get a progress report: stories completed vs. remaining, burndown, blockers, and what Claude is working on.

### 8. Release the Sprint

```
/sprint-release owner/repo
```

This closes the sprint, opens a release PR from the release branch into `development`, and summarizes everything that shipped. You review one PR, merge it, and the sprint is done. When you're ready for production, promote `development` into `main`.

### 9. Emulate the Project

```
/project-emulate
```

Claude reads the entire codebase and runs a multi-phase validation:

1. **Discovery** — finds every role, action, and permission boundary
2. **Integration seam validation** — checks that Docker, build tools, transpilers, IoC containers, config files, and service contracts are mutually consistent
3. **Layer contract validation** — traces data through response helpers, middleware chains, IoC resolution, config stores, and error handlers to verify every layer agrees on data shapes
4. **Cross-service payload validation** — verifies that request/response bodies, query parameters, headers, shared types, pagination contracts, and error shapes match across service boundaries
5. **Full lifecycle walkthrough** — emulates each role executing each action from deployment through teardown
6. **Coverage report** — permission matrix, categorized issues, and missing coverage

### 10. Repeat

```
/sprint-plan owner/repo
```

Start the next sprint. The cycle continues until the project is complete.

## How It Works

### Branch Strategy

```
main (human-only — requires your review)
 └── development (sprint approval gate)
      └── release/core-api
           ├── story/1-init-project → auto-merge ✓
           ├── story/2-database-schema → auto-merge ✓
           └── story/3-auth-endpoints → auto-merge ✓
```

Story branches auto-merge into the release branch when CI passes. At sprint end, the release branch merges into `development` after your review. When you're ready to ship, `development` merges into `main`. Two approval gates: one per sprint, one for production.

### GitHub Project Board

The scaffold creates a GitHub Project (the newer Projects experience, not classic project boards) with these custom fields:

| Field | Type | Purpose |
|---|---|---|
| Status | Single select | Workflow state: Backlog → Ready → In Progress → In Review → Done |
| Sprint | Iteration (2-week) | Time-boxed sprint assignment |
| Priority | Single select | P0-Critical through P3-Low |
| Executor | Single select | Who works this: `claude`, `human`, or `cowork` |
| Story Points | Number | Fibonacci estimation (1, 2, 3, 5, 8, 13) |

Epics are tracked two ways: `epic:*` labels give scrum teams the vocabulary they expect right on every issue, while native GitHub Milestones power the progress tracking (open/closed counts, % complete) behind the scenes. Both are set at issue creation time. You can filter by either on any project view.

**Board views** use GitHub's view system:

- **Current Sprint** — Board layout, filtered to the active sprint, columns by Status
- **Claude Queue** — Table layout, filtered to `Executor = claude` and `Status = Ready`, sorted by Priority
- **My Tasks** — Table layout, filtered to `Executor = human`, grouped by Sprint
- **Backlog** — Table layout, filtered to `Status = Backlog`, sorted by Priority
- **Epic Overview** — Table layout, grouped by Milestone, with field sums on Story Points

You can also use **Slice by** on any field to quickly filter the current view from a side panel — useful for slicing a sprint view by Executor or Priority.

### Shared Conventions

All skills reference a single `CONVENTIONS.md` file that defines labels, branch naming, custom fields, executor guidelines, and story point standards. Edit it once and every skill inherits the changes.

Located at: `project-scaffold/references/CONVENTIONS.md`

## Skills Reference

| Skill | Command | What It Does |
|---|---|---|
| `project-scaffold` | `/project-scaffold <prd-path>` | Full project setup from PRD, or add stories to an existing project |
| `sprint-plan` | `/sprint-plan [owner/repo]` | Plan and populate the next sprint |
| `sprint-status` | `/sprint-status [owner/repo]` | Progress report and burndown |
| `sprint-release` | `/sprint-release [owner/repo]` | Close sprint, open release PR to development |
| `project-emulate` | `/project-emulate` | Integration seams, layer contracts, cross-service payloads, and full lifecycle walkthrough |

## Customization

### Sprint Length
Edit `CONVENTIONS.md` → "Sprint Cadence" section. Default is 2 weeks.

### Velocity Target
The `sprint-plan` skill asks for velocity or defaults to 20 story points. Adjust as you calibrate.

### Label Colors
All label hex colors are defined in the `project-scaffold` skill. Modify to match your preferences.

### Executor Criteria
Edit `CONVENTIONS.md` → "Executor Assignment Guidelines" to tune what gets assigned to Claude vs. you vs. Cowork.

### Adding Epics
Epics map to your PRD structure. To add new epics later, run `/project-scaffold` with the new PRD — it detects the existing project and lets you add stories to existing epics or create new ones.

## Tips

- **Chunk large epics** into multiple sprints for natural review gates. If an epic has 30 stories, split it into 2-3 sprints rather than one massive batch.
- **Start small.** Scaffold a real but small project first to calibrate your conventions before relying on it for bigger work.
- **Branch protection is your safety net.** The PAT should not have write access to main. Merges to main always go through your review.
- **Run `/project-emulate` before releases** to catch integration seam failures, layer contract mismatches, cross-service payload drift, permission gaps, and dead code before shipping.

## License

Apache 2.0 — See [LICENSE](LICENSE) for details.
