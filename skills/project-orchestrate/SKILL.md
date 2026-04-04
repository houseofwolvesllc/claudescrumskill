---
name: project-orchestrate
description: Autonomous project lifecycle driver that ties together all skills into a continuous loop — plan sprints, execute stories in parallel, release, merge, clean up, and repeat until all epics are done, then run emulation hardening loops until the codebase is clean. Use when you want Claude to drive the entire project from backlog to production-ready without manual skill invocation at each step.
---

# Project Orchestrate

Fully autonomous project lifecycle driver. Plans sprints, executes stories via parallel subagents, releases, merges to development, cleans up branches, and repeats until every epic is complete — then hardens the codebase through emulation-driven fix cycles until no issues remain.

---

## Before You Start

1. Read `../project-scaffold/references/CONVENTIONS.md` for all project management standards. Follow these conventions exactly.
2. Read the project's `CLAUDE.md` (if it exists) for project-specific rules. **All subagents you spawn must also read and follow `CLAUDE.md`** — include this instruction explicitly in every subagent prompt.
3. **Terminology:** Always refer to milestones as **"epics"** in all user-facing text, summaries, and conversational output. The word "milestone" should only appear in GitHub API commands and code — never in communication with the user.
4. Confirm the `gh` CLI is authenticated by running `gh auth status`.
5. Identify the target repository. If the user doesn't specify, detect from the current git remote or ask.

### Standing Authorizations

The following actions are pre-authorized and do NOT require user confirmation during orchestration:

- **Merge release PRs to `development`** — after the release PR is created and CI passes
- **Delete merged story and release branches** — standard cleanup after merge
- **Create and switch between feature/release branches** — normal git workflow

The following actions are NEVER authorized:

- **Merge anything to `main`** — always requires explicit human review
- **Force push or destructive git operations** — never permitted
- **Close or delete issues without completing them** — incomplete work rolls over

---

## Input

`$ARGUMENTS` can be:

1. **A PRD file path** (e.g., `path/to/prd.md`) — scaffold the PRD first via `/project-scaffold`, then orchestrate **only the epics and stories created from that PRD**. The repo is detected from the current git remote (or ask the user).
2. **A repo identifier** (e.g., `owner/repo`) — orchestrate **all open epics and stories** already on the project board. No scaffolding step.
3. **A PRD file path + repo identifier** (e.g., `path/to/prd.md owner/repo`) — scaffold the PRD into the specified repo, then orchestrate only those epics/stories.
4. **Nothing** — detect the repo from the current git remote and orchestrate all open epics/stories.

**How to distinguish:** If an argument is a path to an existing file, treat it as a PRD. Otherwise treat it as a repo identifier.

### Scope Rules

- **Phase 1 (Epic Completion Loop):** When a PRD is provided, only execute epics/stories that were created from that PRD. Record the milestone numbers and issue numbers created during scaffolding and limit the sprint loop to those. When no PRD is provided, execute all open epics/stories on the project board.
- **Phase 2 (Emulation Hardening Loop):** Always applies to the **entire codebase** regardless of whether a PRD was provided. Emulation validates the whole project, not just the new work.

---

## State Management

Orchestration state is persisted to `.claude/orchestration-state.md` so progress survives context compaction, usage caps, and session restarts. This file is human-readable markdown.

### State File Structure

```markdown
# Orchestration State

## Meta
- **Repo:** owner/repo
- **Project:** #<number>
- **Phase:** epic-completion | emulation-hardening | project-cleanup
- **Status:** running | paused | completed
- **Scope:** prd | all
- **PRD Source:** path/to/prd.md (if scope=prd, otherwise "—")
- **Scoped Milestones:** #1, #3 (if scope=prd — only these epics are orchestrated in Phase 1)
- **Scoped Issues:** #10, #11, #12, ... (if scope=prd — only these stories are orchestrated in Phase 1)
- **Started:** <ISO timestamp>
- **Last Updated:** <ISO timestamp>

## Current Position
- **Current Epic:** <epic name> (milestone #<number>)
- **Current Sprint:** <N>
- **Hardening Run:** <N> (Phase 2 only)

## Epic Progress
| Epic | Status | Open | Closed | Total |
|------|--------|------|--------|-------|
| Core API | in-progress | 4 | 12 | 16 |
| Dashboard | pending | 8 | 0 | 8 |

## Current Sprint Stories
| # | Title | Executor | Status | Subagent |
|---|-------|----------|--------|----------|
| 12 | Auth endpoint | claude | done | — |
| 13 | Login UI | claude | in-progress | agent-3 |
| 14 | API keys | human | skipped | — |

## Dependency Map
- #15 blocked-by #12 → unblocked (completed)
- #18 blocked-by #15 → waiting

## Log
- [<timestamp>] Phase 1 started — 3 open epics detected
- [<timestamp>] Sprint 1 planned — 8 stories, 19 points
- [<timestamp>] Story #12 completed by subagent
- [<timestamp>] Sprint 1 released — PR #25
```

### State Operations

**On startup**, check for an existing `.claude/orchestration-state.md`:
- If found and `Status: running` → resume from the recorded position
- If found and `Status: paused` → ask the user whether to resume or restart
- If found and `Status: completed` → ask the user whether to start a fresh run
- If not found → initialize a new state file

**During execution**, update the state file:
- After every sprint plan, story completion, release, and phase transition
- On any error that pauses execution
- Keep the log section as an append-only journal (trim entries older than the current phase to prevent unbounded growth)

**On completion**, set `Status: completed` and write a final summary to the log.

---

## Phase 1 — Epic Completion Loop

Drive all open epics to completion through iterative sprint cycles.

### Step 1: Initialize

**If a PRD was provided** — scaffold it first, then scope the run:

```
/project-scaffold <prd-path>
```

After scaffolding completes, capture the milestone numbers and issue numbers that were created. These define the **orchestration scope** — Phase 1 will only plan and execute sprints for these specific epics and stories. Record them in the state file under `Scoped Milestones` and `Scoped Issues`.

**If no PRD was provided** — detect and assess the existing project state:

```bash
# Get open epics (milestones)
gh api repos/<owner/repo>/milestones --jq '.[] | select(.state=="open") | {number, title, open_issues, closed_issues}'

# Get backlog overview
gh issue list --repo <owner/repo> --state open --label "type:story" --json number,title,labels,milestone

# Get current sprint iteration info via GraphQL
# Check for any in-progress work
```

All open epics and stories are in scope for Phase 1.

**In both cases**, present a brief overview to the user:

```
## Orchestration Overview

**Repo:** owner/repo
**Scope:** PRD-scoped (path/to/prd.md) | All open epics
**Epics in scope:** 3
  - Core API: 16 stories (4 remaining)
  - Dashboard: 8 stories (all pending)
  - Notifications: 5 stories (all pending)

**Total stories remaining:** 17
**Estimated sprints:** 2-3 (at 20 pts/sprint)

Starting Phase 1 — Epic Completion Loop.
```

Initialize the state file and proceed.

### Step 2: Sprint Planning

Invoke the `/sprint-plan` skill for the current epic:

```
/sprint-plan <owner/repo>
```

**If PRD-scoped:** Ensure the sprint plan only pulls from the scoped issues (recorded in the state file). If `/sprint-plan` proposes stories outside the scope, exclude them — they belong to other work and should not be mixed into this orchestration run.

Since this is autonomous mode, accept the default sprint plan without waiting for user confirmation — the skill's proposed sprint based on priority ordering and velocity target is the plan.

After planning completes, update the state file with the sprint stories and their dependency map.

### Step 3: Story Execution

Execute all `executor:claude` stories in the current sprint. Skip `executor:human` and `executor:cowork` stories — they will roll over to the next sprint automatically.

**Parallel execution via Task subagents:**

For stories with no unresolved dependencies, spawn parallel Task subagents (using the `Task` tool with `subagent_type: "Bash"` or `subagent_type: "general-purpose"` as appropriate). Each subagent receives:

```
You are executing story #<number> for repo <owner/repo>.

**IMPORTANT:** First read the project's CLAUDE.md file if it exists, and follow all instructions in it.

**Story:** <title>
**Acceptance criteria:** <from issue body>
**Branch strategy:** Create branch `story/<number>-<slug>` from `release/<epic-slug>`, implement, commit, push, and open a PR targeting `release/<epic-slug>`.

After implementation:
1. Open a PR with a clear description of changes
2. Ensure CI passes
3. The PR should target the release branch, NOT development or main

Do NOT merge the PR — just open it and report back.
```

**Execution rules:**

1. **Independence check:** Before spawning subagents, analyze story dependencies. Only spawn stories whose blockers are all resolved.
2. **Concurrency limit:** Run up to 3 subagents in parallel to avoid rate limiting.
3. **Progress tracking:** As each subagent completes, update the state file and check if any blocked stories are now unblocked. Spawn newly unblocked stories immediately.
4. **Failure handling:** If a subagent fails, retry once with additional context about the failure. If it fails again, mark the story as blocked with a note and continue with remaining stories.
5. **PR merging:** After a story PR is opened and CI passes, merge it to the release branch:
   ```bash
   gh pr merge <pr-number> --repo <owner/repo> --squash --auto
   ```
6. **Skip human/cowork stories:** Log them as skipped in the state file. They roll over naturally during sprint release.

**Progress updates** — Print a concise progress line every 2-3 story completions:

```
Sprint 2: 5/8 stories done (13/19 pts) — #21 auth middleware ✓, #22 rate limiting ✓
```

### Step 4: Sprint Release

Once all `executor:claude` stories in the sprint are complete (or retried and marked blocked), invoke the sprint release skill:

```
/sprint-release <owner/repo>
```

This closes the sprint, handles rolled-over stories, and opens the release PR to `development`.

### Step 5: Merge Release PR to Development

After `/sprint-release` creates the release PR, merge it to `development` (standing authorization — no user confirmation needed):

```bash
# Wait for CI to pass on the release PR
gh pr checks <pr-number> --repo <owner/repo> --watch

# Merge the release PR to development
gh pr merge <pr-number> --repo <owner/repo> --squash
```

If merge conflicts exist:
1. Attempt automatic resolution by rebasing the release branch onto `development`
2. If auto-resolution fails, **pause orchestration** and escalate to the user:
   ```
   ⚠️ Merge conflict on release/<epic-slug> → development
   Conflicting files: <list>

   Orchestration paused. Please resolve conflicts and resume.
   ```
3. Update the state file with `Status: paused` and the conflict details.

### Step 6: Branch Cleanup

After successful merge, clean up merged branches (standing authorization):

```bash
# Delete merged story branches
git fetch origin
git branch -r --merged origin/development | grep -E 'origin/story/' | sed 's|origin/||' | while read branch; do
  git push origin --delete "$branch"
done

# If the release branch is fully merged and the epic is complete, delete it too
git push origin --delete release/<epic-slug>

# Prune local references
git remote prune origin
```

Never delete `main` or `development`.

### Step 7: Epic Completion Check

After each sprint cycle, check if the current epic is complete:

```bash
# Check remaining open issues for this epic
gh api repos/<owner/repo>/milestones/<milestone-number> --jq '{open_issues, closed_issues}'
```

**If open issues remain** (excluding `executor:human`/`executor:cowork` stories that were skipped):
- Check if remaining stories are all human/cowork → if yes, the epic's claude-executable work is done, move to next epic
- Otherwise → loop back to Step 2 for another sprint

**If all issues are closed:**
```bash
# Close the epic
gh api repos/<owner/repo>/milestones/<milestone-number> -X PATCH -f state="closed"
```

**If more in-scope epics remain** → move to the next epic (by priority) and loop back to Step 2. When PRD-scoped, only consider epics listed in `Scoped Milestones`.

**If all in-scope epics are complete** → transition to Phase 2.

Print a phase transition summary:

```
## Phase 1 Complete — All Epics Done

**Sprints completed:** 4
**Stories delivered:** 32
**Stories skipped (human/cowork):** 6
**Total points delivered:** 89

Transitioning to Phase 2 — Emulation Hardening.
```

---

## Phase 2 — Emulation Hardening Loop

Validate the **entire codebase** through emulation, fix discovered issues, and repeat until clean. This phase always covers the full project regardless of whether Phase 1 was PRD-scoped — new code must integrate cleanly with the existing codebase.

### Step 8: Run Emulation

Invoke the project emulation skill:

```
/project-emulate
```

This produces the full emulation report in `.claude/reports/emulation-report/`, including `ISSUES.md` with categorized findings.

### Step 9: Parse Findings

Read and parse `.claude/reports/emulation-report/ISSUES.md`. Extract findings by severity:

- **Critical** — must fix (blocks production readiness)
- **Warning** — should fix (degrades quality or reliability)
- **Info** — may fix (cleanup, minor improvements)

If no critical or warning findings exist → skip to Step 14 (Project Cleanup).

Count and categorize:

```
## Emulation Results (Run <N>)

**Critical:** 3 findings
**Warning:** 7 findings
**Info:** 4 findings

Generating hardening PRD for 10 actionable findings.
```

### Step 10: Generate Hardening PRD

Create a PRD document at `.claude/hardening-prd-run-<N>.md` from the emulation findings. This PRD becomes the input for scaffolding a hardening epic.

Structure the PRD as:

```markdown
# Hardening PRD — Run <N>

## Overview
Automated hardening pass based on emulation findings from run <N>.
Addresses <count> critical and <count> warning issues discovered during
full-project emulation.

## Epic: Hardening (Run <N>)

### Stories

#### Fix: <Issue title from ISSUES.md>
**Priority:** <P0 for critical, P1 for warning>
**Executor:** claude
**Story Points:** <estimate based on scope>
**Acceptance Criteria:**
- <derived from the issue description>
- Verify fix by re-checking the specific integration seam / layer contract / workflow

#### Fix: <next issue>
...
```

Only include critical and warning findings. Info-level findings are logged but not scaffolded.

### Step 11: Scaffold Hardening Epic

Invoke project scaffold with the hardening PRD to create a single "Hardening (Run N)" epic:

```
/project-scaffold .claude/hardening-prd-run-<N>.md
```

This creates the milestone, issues, labels, and branches for the hardening work.

### Step 12: Execute Hardening Sprints

Run the same sprint loop as Phase 1 (Steps 2-7) for the hardening epic. Since hardening stories are typically all `executor:claude`, this should proceed fully autonomously.

### Step 13: Re-validate

After the hardening epic is complete, run emulation again:

```
/project-emulate
```

Parse the new findings:

- **If new critical or warning findings exist** → increment the run counter and loop back to Step 10
- **If clean (no critical or warning findings)** → proceed to Step 14 (Project Cleanup)

Safety valve: If this is the 3rd consecutive hardening run, pause and escalate to the user:

```
⚠️ Hardening loop has run 3 times without reaching a clean state.
Remaining findings may require human judgment.

<summary of remaining findings>

Options:
1. Continue for another hardening run
2. Accept current state and finish
3. Review findings manually
```

---

## Phase 3 — Project Cleanup

After emulation hardening is clean (or accepted), run a final mechanical hygiene pass to ensure the codebase builds, lints, and tests cleanly.

### Step 14: Run Project Cleanup

Invoke the cleanup skill in fix mode:

```
/project-cleanup --fix
```

This runs across the **entire codebase** and automatically fixes:
- Build errors and warnings (type errors, unused variables, deprecations)
- Lint violations (ESLint/Biome/etc. with `--max-warnings 0`)
- HATEOAS compliance gaps (missing `_links`, pagination links, consistency)
- Dead and duplicated code (unused exports, files, dependencies, commented-out code)
- Failing tests and coverage gaps (targets 50% minimum across all metrics)

After cleanup completes, read the report at `.claude/reports/cleanup-report/SUMMARY.md`:

- **If all phases PASS** → proceed to Step 15 (Completion Summary)
- **If any phase FAIL** → review the report, attempt a second cleanup pass. If issues persist after two passes, log remaining issues and proceed to Step 15 with a note

Print a phase transition summary:

```
## Phase 3 Complete — Project Cleanup

**Build:** ✅ zero errors, zero warnings
**Lint:** ✅ zero violations
**Project Principles:** ✅ compliant (or SKIP if no principles in CLAUDE.md)
**Dead code:** ✅ none detected
**Tests:** ✅ all passing, <pct>% coverage

Proceeding to completion summary.
```

### Step 15: Completion Summary

Print a comprehensive summary of the entire orchestration run:

```
## Orchestration Complete

### Phase 1 — Epic Completion
- **Epics completed:** <N>
- **Sprints executed:** <N>
- **Stories delivered:** <N> (<points> story points)
- **Stories skipped (human/cowork):** <N>
- **Average velocity:** <points>/sprint

### Phase 2 — Emulation Hardening
- **Hardening runs:** <N>
- **Issues fixed:** <N> critical, <N> warning
- **Final emulation status:** ✅ Clean / ⚠️ Accepted with <N> remaining

### Phase 3 — Project Cleanup
- **Build:** ✅ clean / ⚠️ <N> remaining issues
- **Lint:** ✅ clean / ⚠️ <N> remaining issues
- **Project Principles:** ✅ compliant / ⚠️ <N> violations / ⏭️ skipped (no principles in CLAUDE.md)
- **Dead code:** ✅ none / ⚠️ <N> items remaining
- **Tests:** ✅ passing (<pct>% coverage) / ⚠️ <N> failing, <pct>% coverage
- **Full report:** .claude/reports/cleanup-report/SUMMARY.md

### Timeline
- Started: <timestamp>
- Phase 1 completed: <timestamp>
- Phase 2 completed: <timestamp>
- Phase 3 completed: <timestamp>

### Remaining Work
- <N> human/cowork stories still open across <N> epics
- <list any deferred or unresolved items>
```

Update the state file with `Status: completed`.

---

## Communication Pattern

Keep the user informed without being noisy:

| Event | Output |
|-------|--------|
| Orchestration start | Full overview (Step 1) |
| Sprint planned | Sprint number, story count, point total — 2 lines |
| Every 2-3 stories | Progress line with counts and latest completions |
| Story failure | Immediate single-line alert with story number and error |
| Sprint released | Sprint scorecard — 3-4 lines |
| Merge to development | Single confirmation line |
| Epic completed | Epic summary — 3-4 lines |
| Phase transition | Full phase summary |
| Hardening run start | Run number and finding counts |
| Cleanup started | Single line: "Running project cleanup..." |
| Cleanup complete | Phase 3 summary — 5-6 lines with pass/fail per dimension |
| Orchestration complete | Full completion summary (Step 15) |
| Error/pause | Immediate alert with context and options |

---

## Error Handling

### Subagent Failures
- Retry once with additional context about the failure
- If second attempt fails, mark story as blocked, log the error, and continue
- Do not let a single story failure halt the entire sprint

### Merge Conflicts
- Attempt automatic rebase resolution first
- If auto-resolution fails, pause orchestration and escalate to the user
- Update state file with conflict details for resume

### State File Corruption
- If `.claude/orchestration-state.md` is unreadable or malformed, reconstruct state from GitHub:
  ```bash
  # Get sprint and story status from the project board
  # Get branch state from git
  # Get PR state from gh
  ```
- Log the reconstruction and continue

### Rate Limiting
- If GitHub API returns 429 or secondary rate limit errors, back off exponentially:
  - First: wait 30 seconds
  - Second: wait 60 seconds
  - Third: wait 2 minutes
  - Fourth: pause orchestration and notify the user

### CI Failures on Release Branch
- If CI fails on the release PR, do not merge
- Report the failure with links to the failing checks
- Attempt to identify the failing test or build step
- If the fix is straightforward, create a fix commit on the release branch and retry
- If not, pause and escalate

### Usage Cap / Context Compaction
- The state file ensures progress is not lost
- On resume, read the state file and continue from the last recorded position
- The log section provides context about what happened before compaction
