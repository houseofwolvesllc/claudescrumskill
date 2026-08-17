# Residual Scaffolding Audit — `project-cleanup` and `project-orchestrate`

Spec: `docs/specs/20260807_130617_opus_5_prompt_surface_retune.md` (FR-8).
Both skills were authored for Opus 4.6–4.8 and carry step text written for a model
that under-verified and under-delegated. This audit walks every headed step in the
two files and records which text is load-bearing and which is 4.8-era residue.

## Classification

| Mark | Meaning | Disposition |
|---|---|---|
| **S** | Fragile sequencing — an order, a precondition, or a guard the run depends on | Retained unchanged |
| **R** | Removable scaffolding — trained-default restatement, padding, or guidance already stated elsewhere in the same file | Removed |
| **C** | Content — instruction, schema, or template the run reads as data; neither sequencing nor scaffolding | Retained |

The story's binary is S versus R. **C** is recorded so that coverage of every
headed step is visible rather than implied. A step marked **R (partial)** kept its
sequencing and lost only the named sentences.

## Summary

**Removed — `project-cleanup/SKILL.md`**

1. *Before You Start* item 5, the tooling-availability pre-flight. Item 4 already
   identifies the toolchain from config files, and a missing binary surfaces at
   first invocation with a better error than a probe produces.
2. Four per-phase "re-run and confirm" sentences (Phase 1 Step 3, Phase 2 Step 4,
   Phase 3 Step 3, Phase 5 Step 5). Phase 6 Step 1 re-runs build, lint, and tests
   over the finished state; none of the four guards a destructive operation.
3. Two *Phase 6 Step 2* bullets — no newly failing test, no new lint or build
   warning — both strictly implied by Step 1's clean run.
4. Three *Execution Notes* — "Don't over-abstract", "Don't write bad tests",
   "Preserve project style". Each restates guidance already given at its point of
   use in Phase 4 Step 2 and Phase 5 Step 5.

**Removed — `project-orchestrate/SKILL.md`**

1. *Step 2*'s closing sentence declaring the blocked-by gate "an explicit
   affirmation, not a new requirement". The gate stays; the sentence about the
   sentence goes.
2. *Step 10*'s hardening-story acceptance criterion "Verify fix by re-checking the
   specific integration seam / layer contract / workflow". Step 13 re-runs
   emulation over the whole codebase after the hardening epic, so this bought a
   second per-story pass of the same check.
3. *Step 12*'s "this should proceed fully autonomously", a restatement of Default
   Operating Mode.

**Corrected in passing** (both stale cross-references in text this audit read):
the Communication Pattern table pointed at Step 17 for the completion summary,
which is Step 15; and Step 14 advertised HATEOAS fixes that `project-cleanup`
Phase 3 only performs when the project's `CLAUDE.md` declares them.

**Deliberately kept** (each was a candidate; each stays)

- **The v2.0.0 Workflow-tool precondition, Standing Authorizations, and every
  state-file lifecycle rule.** Named preserves.
- **Phase 4 Step 3's "re-run the build and linter after each batch of removals".**
  It reads like the four sentences removed above, but it guards file deletion —
  the one destructive operation in the skill.
- **"Phase 2 is mandatory" and "Phase 3 is mandatory".** They duplicate Default
  Operating Mode, but they were added in `39934cf` in response to runs that
  skipped both phases. Duplication that fixed an observed failure is not padding.
- **The state-file decision table, stated in both Default Operating Mode and State
  Operations.** Same reasoning, and state-file lifecycle is a named preserve.
- **Step 2's "accept the default sprint plan without waiting for user
  confirmation".** `eeaf33f` consolidated the top-of-file autonomy prose and
  dropped its list of covered decision points, so this is now the only place the
  file says sprint plans need no confirmation.
- **Step 3's "Progress updates".** Duplicated by the Communication Pattern table,
  but it is the only progress instruction at the workflow-return boundary, where
  the run is otherwise silent. Arguable, so kept.
- **"Report, don't surprise" and "CLAUDE.md is king"** in *Execution Notes*. The
  first states why FIXES.md exists rather than restating that it exists; the
  second is the conflict-resolution rule the whole skill defers to.
- **The `IMPORTANT: Read the project's CLAUDE.md first` line in both Step 5a review
  prompts.** It is not duplication — *Before You Start* item 3 requires exactly
  this line in every subagent prompt, and these are its instantiations.

No verification phrasing and no delegation encouragement was introduced.
`test/prompt_surface.test.js` now fails on either across the whole prompt surface,
and `test/skill_guarding_sequences.test.js` pins the removals and the guards.

## `skills/project-cleanup/SKILL.md`

| Headed step | Mark | Note |
|---|---|---|
| Before You Start | R (partial) | Items 1–4 kept (CLAUDE.md authority, conventions, terminology, toolchain detection); item 5 removed |
| Input | S | `--report-only` overrides `--fix` |
| Phase 1: Build Verification | C | Phase framing |
| Step 1: Identify Build Commands | C | Toolchain table |
| Step 2: Run Build | C | Command plus output partition |
| Step 3: Catalog Build Issues | R (partial) | Errors-before-warnings order kept; "re-run the build to confirm" removed |
| Phase 2: Lint Verification | C | Phase framing |
| Step 1: Identify Lint Configuration | C | Linter table |
| Step 2: Run Linter | S | Warnings must be fatal (`--max-warnings 0`) |
| Step 3: Catalog Lint Issues | C | Record shape |
| Step 4: Apply Fixes | R (partial) | Auto-fix-before-manual order kept; closing "re-run to confirm" removed |
| Phase 3: Project Principles Compliance | S | Skip entirely when `CLAUDE.md` declares no principles |
| Step 1: Extract Principles from CLAUDE.md | C | Principle inventory |
| Step 2: Audit Compliance | C | Scan procedure |
| Step 3: Catalog Violations | R (partial) | Severity order kept; two re-check bullets removed |
| Phase 4: Dead and Duplicated Code Detection | C | Phase framing |
| Step 1: Dead Code Detection | S | The exclusion list is what keeps entry points from being deleted |
| Step 2: Duplicated Code Detection | C | Extraction judgment calls |
| Step 3: Catalog Dead/Duplicated Code | S | Re-run build and lint after each batch of deletions |
| Phase 5: Test Verification and Coverage | C | Phase framing |
| Step 1: Identify Test Framework | C | Framework table |
| Step 2: Run Tests | C | Command and captures |
| Step 3: Analyze Test Results | C | Failure taxonomy, coverage table |
| Step 4: Identify Coverage Gaps | C | Prioritization |
| Step 5: Fix Tests and Improve Coverage | R (partial) | Failures-before-coverage order kept; closing full-suite re-run removed |
| Phase 6: Final Validation | S | The single end-state gate the per-phase re-runs deferred to |
| Step 1: Full Verification Run | S | Build, lint, tests in sequence |
| Step 2: Regression Check | R (partial) | Diff summary and per-file coverage kept; two Step 1-implied bullets removed |
| Output | C | Report location |
| Report Structure | C | File layout |
| SUMMARY.md Format | C | Template |
| Execution Notes | R (partial) | "CLAUDE.md is king", "Fix in dependency order" (S), "Report, don't surprise" kept; three restatements removed |

## `skills/project-orchestrate/SKILL.md`

| Headed step | Mark | Note |
|---|---|---|
| Before You Start | S | Item 0 is the v2.0.0 Workflow-tool precondition; the reads it orders feed later steps |
| Standing Authorizations | S | Named preserve; the never-authorized list guards `main` and force pushes |
| Default Operating Mode | S | Autonomy default, the four pause triggers, state-file rule |
| Input | C | Argument forms |
| Scope Rules | C | Phase 1 scoping versus Phase 2 whole-codebase |
| Input Parsing and Mode Detection | S | Classify and announce before any work |
| Mode Classification | S | First match wins |
| Flag Parsing | S | Unknown flags abort before orchestration starts |
| Glob Expansion | S | Expand before classification |
| Announcement (Mandatory) | C | Output format |
| Routing | S | Mode-to-section dispatch |
| Dependency Resolution | S | Runs after classification, before any spec |
| `depends_on` Frontmatter | C | Field shape |
| Path Resolution | S | Ordered fallbacks; unresolved entries abort |
| Dependency Graph Construction | C | Node and edge definition |
| Cycle Detection | S | Aborts with no spec started |
| Missing-Dependency Detection | S | Aborts with no spec started |
| Topological Sort with Stable Tie-Break | S | Execution order |
| No-`depends_on` Fallback | C | Degenerate case |
| Pre-Execution Validation Order | S | The seven checks and their order |
| State Management | S | Named preserve |
| State File Structure | C | Template |
| State Operations | S | Startup, during-run, and completion transitions |
| Phase 1 — Epic Completion Loop | C | Phase framing |
| Step 1: Initialize | S | Scaffold, then record scope, then proceed |
| Step 2: Sprint Planning | R (partial) | Blocked-by gate and autonomous acceptance kept; self-negating affirmation removed |
| Step 3: Story Execution | C | Pipeline overview |
| Path Resolution | S | `<skills-root>` derivation for the workflow script |
| Pre-spawn checks | S | Independence, persona, human/cowork skip before invoking |
| Invocation | C | Workflow argument schema |
| Post-workflow persistence | S | Per-status persistence of the workflow return |
| Concurrency, isolation, and barriers | S | Worktree versus serial-in-tree, the merge lock, the reset that omits `-x` |
| Progress updates | C | Kept though partly duplicated; see Summary |
| Step 4: Sprint Release | S | Runs only once the sprint's claude stories settle |
| Step 5: Review and Merge to Development | S | 5a review, 5b act, 5c merge — in that order |
| Step 6: Branch Cleanup | S | Deletes branches; never `main` or `development` |
| Step 7: Epic Completion Check | S | Loop-or-advance decision |
| Phase 2 — Emulation Hardening Loop | S | Mandatory; see Summary |
| Step 8: Run Emulation | C | Skill invocation |
| Step 9: Parse Findings | S | Severity gate into Step 10 or Step 14 |
| Step 10: Generate Hardening PRD | R (partial) | Template kept; per-story re-check criterion removed |
| Step 11: Scaffold Hardening Epic | C | Skill invocation |
| Step 12: Execute Hardening Sprints | R (partial) | Loop reference kept; autonomy restatement removed |
| Step 13: Re-validate | S | Re-emulate, loop, and the 3-run safety valve |
| Phase 3 — Project Cleanup | S | Mandatory; see Summary |
| Step 14: Run Project Cleanup | C | Fix inventory; stale HATEOAS bullet corrected |
| Step 15: Completion Summary | C | Template |
| Step 16: ADR Update | S | Read existing ADRs before numbering the next |
| Step 17: Clean Up State File | S | Named preserve; suppressed in multi-path mode |
| Sequential Multi-Path Mode | S | Wrapper contract |
| Per-Spec Loop | S | One spec end-to-end before the next |
| Spec Slug Derivation | S | Collision aborts before any spec starts |
| Per-Spec State File Lifecycle | S | Named preserve |
| Queue State File | S | Named preserve |
| Safety-Gate Pause Announcements | C | Output format |
| Resume Semantics | S | Recorded order wins; completed specs are not re-run |
| Cumulative Summary | C | Template |
| Merged Mode (Opt-In) | C | Legacy opt-in plus its deprecation warning |
| Communication Pattern | C | Output cadence; stale Step 17 reference corrected |
| Error Handling | S | Failure policy |
| Subagent Failures | S | Retry once, then block and continue |
| Merge Conflicts | S | Rebase, then pause |
| State File Corruption | S | Reconstruct, then continue |
| Rate Limiting | S | Backoff ladder ending in a pause |
| CI Failures on Release Branch | S | Do not merge on red CI |
| Usage Cap / Context Compaction | C | Why the state file exists |
