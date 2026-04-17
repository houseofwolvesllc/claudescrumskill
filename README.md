# Claude Scrum Skill

An open-source npm package of Claude Code skills that give you a complete scrum pipeline — from PRD to production release — with Claude as your scrum master. Works with **local file-based backlogs**, **GitHub Projects**, **Jira**, or **Trello**.

Includes project scaffolding, sprint planning, status tracking, sprint releases, full-project emulation testing, autonomous orchestration, and project cleanup.

```
Manual mode — you invoke each skill:

PRD  -->  /project-scaffold  -->  backlog (local, GitHub, Jira, or Trello)
                                      |
                                /sprint-plan --> populate the next sprint
                                      |
                               Claude works stories --> commits to release branch
                                      |
                                /sprint-status --> check progress anytime
                                      |
                               /sprint-release --> wrap up sprint, merge to development
                                      |
                                 You review   --> merge to main when ready
                                      |
                                /sprint-plan  --> next cycle

Autonomous mode — one command drives the full lifecycle:

PRD (optional)  -->  /project-orchestrate
                           |
            +----- Epic Completion Loop ------+
            |  /sprint-plan --> execute stories |
            |  --> /sprint-release --> merge    |
            |  --> branch cleanup --> repeat    |
            +----------------+-----------------+
                             |
            +--- Emulation Hardening Loop ----+
            |  /project-emulate --> findings   |
            |  --> generate PRD --> scaffold   |
            |  --> fix sprints --> re-emulate  |
            +----------------+-----------------+
                             |
                    Production-ready codebase
```

---

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Provider Setup](#provider-setup)
- [Skills Reference](#skills-reference)
- [Branch Strategy](#branch-strategy)
- [Personas](#personas)
- [Autonomous Orchestration](#autonomous-orchestration)
- [Customization](#customization)
- [Tips](#tips)
- [License](#license)

---

## Installation

### Claude Code Plugin (recommended)

```
/plugin marketplace add houseofwolvesllc/claudescrumskill
/plugin install claude-scrum-skill@houseofwolvesllc
```

This installs all skills as a native Claude Code plugin with automatic updates. To update later:

```
/plugin marketplace update
```

### npm

```bash
# Global install — available in all projects
npm install -g @houseofwolvesllc/claude-scrum-skill

# Local install — this project only
npm install @houseofwolvesllc/claude-scrum-skill
```

Global install copies skills to `~/.claude/skills/`. Local install copies them to `<project>/.claude/skills/` and adds `.claude-scrum-skill` to your `.gitignore`.

### Manual

Clone the repo and copy the `skills/` contents into `~/.claude/skills/` (global) or `<project>/.claude/skills/` (per-project). All skill directories must be siblings under the same parent, with `shared/` alongside them — skills reference `../shared/references/` via relative paths.

> **Note:** After installing, restart Claude Code for the skills to become available.

---

## Configuration

All configuration lives in `skills/shared/config.json`:

```json
{
  "scaffolding": "local",
  "paths": {
    "specs": ".claude-scrum-skill/specs",
    "adr": ".claude-scrum-skill/adr",
    "backlog": ".claude-scrum-skill/backlog"
  },
  "jira": {
    "project_key": ""
  },
  "trello": {
    "board_id": ""
  }
}
```

### Scaffolding Modes

| Mode | Description | Auth Required |
|------|-------------|---------------|
| `local` | File-based backlog in your project directory (default) | None |
| `github` | GitHub Issues, Milestones, and Projects | `gh` CLI |
| `jira` | Jira Cloud issues, epics, and sprints | Env vars |
| `trello` | Trello boards, lists, and cards | Env vars |

### Configurable Paths

| Path | Default | Purpose |
|------|---------|---------|
| `paths.specs` | `.claude-scrum-skill/specs` | Spec documents from `/spec` |
| `paths.adr` | `.claude-scrum-skill/adr` | Architecture Decision Records |
| `paths.backlog` | `.claude-scrum-skill/backlog` | Local backlog files (local mode only) |

To check these files into version control (e.g., `docs/adr`), change the path and it won't be covered by the `.gitignore` entry for `.claude-scrum-skill`.

---

## Quick Start

### Local Mode (default — no setup required)

1. **Write a PRD** — Create a markdown file describing your project, epics, and stories.

2. **Scaffold the project:**
   ```
   /project-scaffold path/to/prd.md
   ```
   This creates a local backlog with epic directories and story files in `.claude-scrum-skill/backlog/`.

3. **Plan a sprint:**
   ```
   /sprint-plan
   ```

4. **Work stories** — Tell Claude to pick up `executor:claude` stories from the sprint.

5. **Check progress:**
   ```
   /sprint-status
   ```

6. **Release the sprint:**
   ```
   /sprint-release
   ```

7. **Or go fully autonomous:**
   ```
   /project-orchestrate path/to/prd.md
   ```

### Remote Mode (GitHub, Jira, or Trello)

1. Set `"scaffolding"` in `config.json` to `"github"`, `"jira"`, or `"trello"`.
2. Complete the [provider setup](#provider-setup) for your chosen provider.
3. Follow the same workflow above — the skills automatically use the configured provider's API.

---

## Provider Setup

### GitHub

Create a fine-grained Personal Access Token:

1. Go to [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) and generate a new token.

2. Grant these **repository permissions**:

   | Permission | Access | Why |
   |---|---|---|
   | Contents | Read & Write | Create branches, push commits |
   | Issues | Read & Write | Create and update stories |
   | Metadata | Read | Required by GitHub for all PATs |
   | Pull requests | Read & Write | Open PRs for releases |

3. Grant this **account permission**:

   | Permission | Access | Why |
   |---|---|---|
   | Projects | Read & Write | Create project boards and fields |

4. Authenticate the CLI:
   ```bash
   echo "YOUR_TOKEN" | gh auth login --with-token
   gh auth status
   ```

> **Security tip:** Do not grant write access to `main`. Set up branch protection so merges to `main` always require your review.

### Jira

1. Generate an API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

2. Set environment variables:
   ```bash
   export JIRA_SITE="https://yourcompany.atlassian.net"
   export JIRA_EMAIL="you@example.com"
   export JIRA_API_TOKEN="your-api-token"
   ```

3. Optionally set the project key in `config.json`:
   ```json
   {
     "scaffolding": "jira",
     "jira": {
       "project_key": "MYPROJ"
     }
   }
   ```

4. If `project_key` is empty, `/project-scaffold` creates a new Scrum project automatically and saves the key back to config.json. If set, it uses the existing project.

### Trello

1. Get your API key from [trello.com/power-ups/admin](https://trello.com/power-ups/admin).

2. Generate a token by visiting:
   ```
   https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY
   ```

3. Set environment variables:
   ```bash
   export TRELLO_API_KEY="your-api-key"
   export TRELLO_TOKEN="your-token"
   ```

4. Optionally set the board ID in `config.json`:
   ```json
   {
     "scaffolding": "trello",
     "trello": {
       "board_id": "your-board-id"
     }
   }
   ```
   Find your board ID by opening the board in Trello, adding `.json` to the URL, and looking for the `"id"` field.

5. If `board_id` is empty, `/project-scaffold` creates a new board automatically and saves the ID back to config.json. If set, it uses the existing board.

> **Note:** Trello has no native sprint, dependency, or story point support. Sprints are modeled as lists, points are stored in custom fields (or card title prefixes), and dependencies are tracked in card descriptions.

---

## Skills Reference

| Skill | Command | What It Does |
|---|---|---|
| **project-scaffold** | `/project-scaffold <prd-path>` | Full project setup from PRD |
| **spec** | `/spec <prompt>` | Transform a rough idea into a structured spec document |
| **sprint-plan** | `/sprint-plan [owner/repo]` | Plan and populate the next sprint |
| **sprint-status** | `/sprint-status [owner/repo]` | Progress report and burndown |
| **sprint-release** | `/sprint-release [owner/repo]` | Close sprint, merge to development |
| **project-emulate** | `/project-emulate` | Integration seams, layer contracts, cross-service payloads, full lifecycle walkthrough |
| **project-orchestrate** | `/project-orchestrate [prd] [repo]` | Autonomous lifecycle driver |
| **project-cleanup** | `/project-cleanup [path] [--fix]` | Build, lint, dead code, and test coverage |

The `[owner/repo]` argument is only needed in GitHub mode. Jira, Trello, and local modes read from config.

---

## Branch Strategy

All modes share the same git branch strategy:

```
main (human-only — requires your review)
 +-- development (sprint approval gate)
      +-- release/core-api
           +-- story/1-init-project     --> auto-merge
           +-- story/2-database-schema  --> auto-merge
           +-- story/3-auth-endpoints   --> auto-merge
```

- **Story --> Release branch:** Auto-merge when CI passes (or direct merge in local mode)
- **Release --> development:** PR review in GitHub mode, direct merge in local/Jira/Trello mode
- **development --> main:** Always human-initiated

---

## Personas

Stories can be assigned a **persona** that controls the posture of the subagent executing them during orchestration. Personas are defined in `skills/shared/references/PERSONAS.md`.

| Persona | Assigned via | Behavior |
|---|---|---|
| `impl` (default) | No label needed | Standard implementation — write code, tests, open PR |
| `ops` | `persona:ops` label or frontmatter | Ops/infra posture — idempotency, rollback, least privilege |
| `research` | `persona:research` label or frontmatter | Research posture — output is a document (ADR/RFC), not code |
| `review` | Automatic (release gate) | Reviews the release diff, reports findings by severity |

During sprint planning, personas are assigned automatically based on story labels (e.g., `scope:infra` gets `persona:ops`). Override by manually setting the label or frontmatter before orchestration.

---

## Autonomous Orchestration

`/project-orchestrate` chains all skills into a fully autonomous pipeline.

### Phase 1 — Epic Completion Loop

1. Scaffolds the PRD (if provided) or reads existing backlog
2. Plans sprints via `/sprint-plan`
3. Executes `executor:claude` stories in parallel via subagents with persona routing
4. Releases via `/sprint-release`
5. Runs automated review gate (using the `review` persona)
6. Merges to `development` and cleans up branches
7. Repeats until all epics are complete

### Phase 2 — Emulation Hardening Loop

1. Runs `/project-emulate` to discover issues
2. Generates a hardening PRD from critical/warning findings
3. Scaffolds and executes a hardening epic
4. Re-emulates until clean (safety valve at 3 runs)

### Phase 3 — Project Cleanup

1. Runs `/project-cleanup --fix` across the entire codebase
2. Reviews and updates ADRs based on decisions made during orchestration
3. Cleans up the orchestration state file

### State Persistence

Orchestration state is saved to `.claude-scrum-skill/orchestration-state.md`. If Claude hits a usage cap or the session restarts, it picks up exactly where it left off.

### Safety Boundaries

- Merges to `development` are pre-authorized
- Merges to `main` are **never** automatic
- Failed stories are retried once, then marked blocked
- Merge conflicts pause orchestration and escalate to you
- After 3 hardening runs, Claude pauses and asks for guidance
- Review gate can be skipped with `ORCHESTRATE_SKIP_REVIEW=1`

---

## Customization

### Sprint Length
Edit `shared/references/CONVENTIONS.md` > "Sprint Cadence". Default: 2 weeks.

### Velocity Target
`/sprint-plan` asks for velocity or defaults to 20 story points.

### Label Colors
Defined in `project-scaffold/SKILL.md`. Modify to match your preferences.

### Executor Criteria
Edit `shared/references/CONVENTIONS.md` > "Executor Assignment Guidelines".

### Personas
Edit `shared/references/PERSONAS.md` to add or modify persona preambles.

### Output Paths
Edit `shared/config.json` to change where specs, ADRs, and backlog files are written. Point them to a non-dotfile path (e.g., `docs/adr`) to include them in version control.

### Adding Epics
Run `/project-scaffold` with a new PRD — it detects the existing project and offers to add stories to existing epics or create new ones.

---

## Shared References

All skills reference shared configuration and standards from `skills/shared/`:

```
skills/shared/
  +-- config.json                 # mode, paths, provider settings
  +-- references/
       +-- CONVENTIONS.md         # labels, branches, fields, estimation
       +-- PERSONAS.md            # subagent role preambles
       +-- PROVIDERS.md           # GitHub/Jira/Trello API reference
```

---

## Tips

- **Start with local mode.** No setup required — scaffold a PRD and start working immediately.
- **Branch protection is your safety net.** The PAT should not have write access to `main`.
- **Run `/project-emulate` before releases** to catch integration seam failures, layer contract mismatches, and permission gaps.
- **Run `/project-cleanup --fix` after major changes** to enforce build/lint cleanliness and test coverage.
- **Chunk large epics** into multiple sprints for natural review gates.
- **Jira/Trello users:** If no project key or board ID is configured, `/project-scaffold` creates one automatically (Scrum template for Jira).

---

## License

Apache 2.0 — See [LICENSE](LICENSE) for details.
