# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.6.1] — 2026-08-20

Closes debrief finding F5 — the orphaned worktrees. A reported run left 25 worktrees
and roughly 65GB behind, because worktree mode created two worktrees per story and
nothing ever reclaimed them: the Workflow tool releases a worktree only when it is
*unchanged*, and a story's worktree always carries commits.

Fixing it is mostly a question of what NOT to delete. A repository holds worktrees
this sprint never created — concurrent sprints, other agents' workspaces, the user's
own checkouts — and a blanket prune takes all of them.

### Fixed
- **A worktree-mode sprint now reclaims the worktrees it created** (`lib/workflows/_shared/prune_story_worktrees.mjs`, new): a worktree is removed only when it sits under the harness's own `.claude/worktrees/` directory AND is identifiably this sprint's — checked out on a story branch that landed, or detached at a commit already merged into the release branch. The second clause is what catches the verify worktrees, which carry no branch to match on, and what keeps a **concurrent** sprint safe: its worktrees sit at commits not yet merged here, so they fail the ancestry test. A story that did not land keeps its worktree, so the failure stays inspectable. Removal takes the checkout, never the branch; commits stay reachable.

### Changed
- **The teardown rule runs in the pipeline, not in a prompt** (`lib/workflows/sprint_pipeline.js`): a `teardown` probe agent reports `git worktree list --porcelain` and which detached HEADs are ancestors of the release branch; `selectRemovableWorktrees` decides; a second agent is handed exact paths and no discretion. Describing the rule in prose and trusting an agent to apply it would have repeated the defect ADR-0009 was written about — and would have made the module dead code, which is the shape of the last four defects this suite shipped.
- **`teardown` joins the stage tier table** (`lib/workflows/_shared/resolve_agent_tier.mjs`): cheapest model, low effort. Both calls are mechanical.

### Added
- ADR-0010 records the decision and why selection is scoped rather than blanket.
- `test/teardown_prune_scoping.test.js` — four structural guards that the teardown prompt is built from `pruneWorktreeCommands` and can never emit an unscoped removal.
- `prune_story_worktrees.test.mjs` — ten unit tests over the selection rule, including "leaves a concurrent sprint's worktree alone" and "never reclaims a worktree outside `.claude/worktrees/`".

### Verified
Two live worktree-mode sprints, neither passing `isolationStrategy`, so the gate
selected worktree mode on its own. Story branches were namespaced per epic, verify
worktrees detached correctly, and merges serialized. Teardown then removed exactly
the landed story's two worktrees, left the seven unrelated workspaces and the main
tree untouched, and **retained** the worktree of a story that failed — a retention
path exercised by an unplanned infrastructure failure rather than by design. The
worktree listing after the sprint was identical to the listing before it.

## [2.6.0] — 2026-08-20

Closes the three cheapest findings from a 46-story production run's debrief. That
run delivered 45 of 46 stories but lost substantial work to harness defects, and
its own summary named the shape they shared: **the harness had the information
needed to catch the problem and did not check.** The skill decides what work to do
next well; it did almost nothing to verify that what it just claimed happened,
happened. For an autonomous unpaused run that is the whole gap.

### Fixed
- **Verification was locked out of the tree it had to read** (`lib/workflows/sprint_pipeline.js`): `buildVerifyPrompt` instructed `git checkout <branch>`, and a branch ref is held by exactly one worktree — so when the implement stage held it, verify landed in a tree that did not contain the work. In the reported run that cost roughly twelve occurrences, at least four false BLOCKED reports, and about fourteen cascaded blocks. A **commit** is not locked the way a ref is: verification now detaches at the implement stage's head SHA. No bare branch checkout remains in the verify prompt.
- **"Empty" and "unreachable" rendered as the same sentence** (`_shared/assert_tree_identity.mjs`): agents reported *"src/ is completely empty"* when the true condition was *"I cannot read the tree I was pointed at"* — different diagnoses from identical text, which is what turned one incident into twelve. The verify agent now confirms `git rev-parse HEAD` matches the SHA it was given **before** reporting on any file, and a mismatch reports `infrastructure-failed` — reusing the vocabulary added in 2.4.0 rather than inventing a second one. The observed SHA rides in the structured return, so a mismatch is visible in data rather than only in prose.

### Added
- **Launch receipts** (`_shared/reconcile_story_results.mjs`): the pipeline returned one entry per story, but nothing compared the returned set against the requested set — so a truncated batch looked exactly like a completed one. That is how an epic was reported underway with 7 of its 14 stories dispatched. The batch now names every story nothing came back for. The comparison is by story ID rather than by success, so blocked and failed stories still count as reported.
- **Artifact-based phase gating** (`skills/project-orchestrate/SKILL.md`, `_shared/artifact_freshness.mjs`): Phase 2 and Phase 3 completion are conditioned on their reports having been written *by this run*, read via `stat` and compared against the phase start. An artifact whose mtime predates the phase start, or that is not there at all, means the phase did not run — no summary describing it can make it so. Stale, missing, and unparseable timestamps all fail closed.

### Note on what emulation caught
The freshness module shipped **inlined into the pipeline and called from nowhere** — 41 lines of dead code registered in the inline manifest with zero call sites. The gate itself is sound and lives in the skill, because the workflow runtime cannot read a filesystem (ADR-0006); the module had duplicated that logic where it could never reach the data. The inline is removed; the module and its thirteen tests stay as the executable specification of the gate's semantics. The verify agent for that finding hit the StructuredOutput retry cap and returned no verdict, so it was resolved on the merits rather than counted as passed.

## [2.5.0] — 2026-08-17

Makes the parallel-execution gate actually fire, and makes it explain itself when
it does not. Reported from real use: worktree mode had to be requested by hand
because auto-detection kept choosing serial.

### Fixed
- **`copyOnWriteSupported` was read but never asked for** (`lib/workflows/sprint_pipeline.js`): the field gates both whether `clone` is offered as a viable strategy and whether it falls back to `install`, but no probe ever supplied it — so it was `undefined` in every real run. `undefined !== false` meant `clone` was always offered and its fallback could never fire, leaving 2.4.0's "fall back to install where the filesystem has no copy-on-write support" unreachable in production. The probe now tests it directly (`cp -c` on APFS, `cp --reflink=always` on btrfs/XFS) rather than inferring from the OS, and reports **false** when the test fails or cannot be run — false being the safe answer, since it forces the install fallback instead of attempting a clone that cannot work.

### Changed
- **A serial-in-tree choice now says why** (`lib/workflows/sprint_pipeline.js`): the log reported `git ls-files node_modules: empty`, which is evidence for the *old* question — whether dependencies were tracked — not the one the gate now asks. A run that declined to parallelize was indistinguishable from a run that could not, whether the cause was an errored probe, a root with no recognized lockfile, no main tree path, or a filesystem that cannot clone. The line now names the viable strategies, or names precisely which inputs were missing.

### Added
- **A guard for the whole defect class** (`test/probe_schema_coverage.test.js`): every field read off a probe result must appear in that probe's schema. This is the third time a value has been consumed that nothing supplied — `sessionModel` in 2.3.0, `viableProvisioning` on the error path in 2.4.0, and `copyOnWriteSupported` here. Each read `undefined` in production while unit tests passed, because unit tests pass the value directly and the read site looks identical either way. The mismatch is only visible statically, which is where this now checks it.

## [2.4.0] — 2026-08-17

Unlocks parallel story execution. Worktree mode — concurrent stories, each in
its own `git worktree`, fanning into the release branch behind a serialized
merge — was already built but effectively unreachable: the isolation gate
selected it only when `node_modules` was vendored into git, because
`git worktree add` materializes tracked files only. The gate asked whether
dependencies were already tracked when it should have asked whether the
worktree can obtain them.

### Added
- **`dependencyStrategy` — four ways a worktree gets its dependencies** (`lib/workflows/_shared/resolve_dependency_strategy.mjs`): `assume-present` (today's behaviour, and still the default), `clone` (copy-on-write, near-instant and isolated but non-validating), `install` (the project's clean-install command — slower, and the only strategy that *validates*), and `symlink` (cheapest, but shared mutable state). Package manager is resolved from the lockfile across npm, pnpm, yarn, and bun; on pnpm the content-addressable store already makes per-worktree installs cheap, so the resolver prefers `install` there and the tradeoff this feature manages does not apply.
- **Disk-bounded worktree concurrency** (`_shared/resolve_worktree_concurrency.mjs`, `_shared/limit_concurrency.mjs`): the fan-out cap was `min(16, cores − 2)`, but sixteen worktrees times a large dependency tree is many gigabytes of transient disk. Concurrency is now bounded by available disk as well as cores, and **which constraint bound the run is logged**, so a slow run is diagnosable rather than mysterious.
- **An `infrastructure-failed` story status** (`schemas/SprintStoryReturnSchema.json`, `_shared/classify_story_failure.mjs`): `failed` meant *the story's code did not work*, and reusing it for a failed dependency setup sends someone hunting a phantom bug. This is not hypothetical — while building this very release, a story was reported `failed` when its agent ended without returning structured output, despite the work being complete.

### Changed
- **The isolation gate asks whether dependencies can be obtained** (`_shared/detect_repo_layout.mjs`): `classifyIsolationStrategy` now takes the viable provisioning strategies and selects worktree mode whenever one exists, falling back to serial-in-tree only when none does. A repo with untracked `node_modules` runs stories in parallel. The existing `isolationStrategy` override semantics are preserved.
- **Strategy selection is story-aware**: `clone` by default for speed, escalating to a validating `install` for any story that touches `package.json` or a lockfile. Under `clone` or `symlink` a missing lockfile update passes silently and breaks CI later; under `install` it fails during the story. A post-hoc reconciliation **reports** a story that touched dependency files without having been escalated rather than silently re-provisioning — a silent correction would hide a detection gap that recurs.
- **Story branches are namespaced per epic** — `story/<epic-slug>/<story-slug>`. Two concurrent runs in this repo both wanted `story/document-credential-resolution`, and afterwards the ref pointed at whichever finished last. The collision was found by a contaminated measurement rather than by a test, so a structural guard now asserts no story branch is constructed without its epic prefix.

### Fixed
- **Unsafe strategies are refused, not silently downgraded**: `clone` falls back to `install` where the filesystem has no copy-on-write support rather than performing the expensive recursive copy it exists to avoid, and `symlink` **fails loud** — naming the offending story — when a batch contains a story that touches `package.json` or a lockfile, because one story running an install would corrupt its siblings mid-run.

### Note on design
The spec named a candidate Gang of Four **Strategy** pattern for the four provisioning mechanisms — the first time this suite has named one rather than declining. It was recorded as an explicit, non-binding hypothesis, and it did not survive contact: the resolver shipped as twelve plain functions over a `PROVISIONERS` dispatch table with zero classes. The Arbitration Rule governed, which is the pattern-naming discipline working as intended.

## [2.3.0] — 2026-08-08

Retunes the prompt surface and agent fan-out for Claude Opus 5. The suite was
authored across the Opus 4.6–4.8 era, and moving the session model to Opus 5
raised wall-clock and token usage roughly fourfold with no code change — the
model self-verifies unprompted, thinks by default, and delegates readily, so
scaffolding written to compensate for the opposite behaviour became duplicated
work at full price.

Measured after the change, on identical three-story sprints from the same base
commit: **1.12–1.13× the tokens of v2.2.1 on Opus 4.8**, with equivalent output
(same five files, both suites green) and one robustness improvement. Agent
counts matched at 15; the new build offloaded 10 stages to the cheapest tier and
2 one tier down, leaving `implement` at the session model. The emulation phase
measured separately at −26% per finding.

### Added
- **A stage-to-tier resolver for workflow agents** (`lib/workflows/_shared/resolve_agent_tier.mjs`): every `agent()` call in every workflow script inherited the operator's session model and effort, because none of them set either. A run therefore paid the session tier for stages whose entire job is running `git ls-files`, resetting a worktree, or opening a PR. The resolver is a constant `STAGE_TIERS` map plus a pure function: mechanical stages (`detect-layout`, `reset`, `pr`) resolve to the cheapest model at low effort, `implement` declares session-inheritance explicitly, `verify` keeps the session model at low effort, and `review`/`skeptic`/`judge` step one tier down at medium effort. Tiering never degrades *below* the session model — a "one tier down" stage on an already-inexpensive session stays put. Following the established `_shared/` convention the module is inlined into the three consuming scripts (the Workflow runtime cannot import across files) and registered in `inline_manifest.mjs`, so `inline_sync.test.mjs` fails the build if a copy drifts.

### Changed
- **Every agent call site now declares its tier** (`lib/workflows/sprint_pipeline.js`, `adversarial_verify.js`, `elaborate_epics.js`): all nine stages spread `resolveAgentTier(stage, sessionModel)`, and `sessionModel` is threaded through `normalizeArgs` in each consumer. Declaring session-inheritance explicitly — rather than leaving a call bare — is what makes an omission detectable, and `lib/workflows/agent_tiers.test.mjs` enforces it: an `agent()` call with no tier spread fails the build, named by the stage its label identifies.
- **`ENGINEERING_BASELINE.md` is now guarded rather than trimmed** (`skills/shared/references/`, `test/engineering_baseline.test.js`): the retune initially cut the file from 1,077 to 190 words on the reasoning that its Clean Code and TDD sections restate canon the model already knows, and that the cost is paid once per agent across the whole fan-out. That reduction was **reverted by project-owner decision**: the canon stays as *reinforcement*, on the view that having it in front of an implementation agent at write time is worth its per-agent cost even when the model could recall it unprompted. The file is unchanged from its pre-retune content. What is new is the guard: `test/engineering_baseline.test.js` pins the Arbitration Rule verbatim, the four Emergence priorities in order, the precedence chain, and the presence of the load-bearing canon markers — so a future trim cannot quietly remove either the project's own stance or the reinforcement.
- **4.8-era scaffolding removed from `/project-cleanup` and `/project-orchestrate`** (`skills/`): both files carried per-phase "re-run and confirm" sentences and trailing notes restating guidance already given at its point of use — text written for a model that under-verified, which now buys a second pass at full price. Every headed step was classified and its disposition recorded in `docs/residual-scaffolding-audit.md`; only same-file duplication, padding, and trained-default restatement was removed. Fragile sequencing was kept and is now guarded by `test/skill_guarding_sequences.test.js`: the v2.0.0 Workflow-tool precondition, Standing Authorizations, every state-file lifecycle rule, and Phase 4's re-run guard on the one destructive operation. Two stale cross-references were corrected in passing.
- **Tiering is now story-aware** (`lib/workflows/_shared/resolve_agent_tier.mjs`, `sprint_pipeline.js`): tiering asked what *kind* of work a stage is but never how *hard* the story is, so a 1-point README edit and a 13-point core-domain story both ran `implement` at the session model. `resolveAgentTier` now takes the story: `review` runs cheapest at 1–2 points and one tier down above; `verify` is always cheapest, since it runs a build/lint/test command and reports a status rather than exercising judgment. **`implement` is deliberately excluded from difficulty tiering** and holds at the session model for every story, matching pre-tiering behaviour exactly — it writes the artifact, so its output quality *is* the product's quality, and `points` is an estimate authored before anyone read the code, so tiering on it would stake the artifact on a guess. `review` may vary because a weak review is caught downstream by `verify` and the tests, whereas a weak implementation is not recoverable. Two overrides cut against cost for the same reason the retune kept verification guarding destructive operations: `persona: ops` and `priority: P0-critical` never tier down. The story argument is optional — `adversarial_verify` has findings, not stories, and falls back to stage tiering.

### Removed
- **A stray `ultrathink` token** (`skills/project-spec/SKILL.md`): the word sat mid-sentence at the end of the skill's overview line, reading like an accidental paste, and forced maximum thinking on every `/project-spec` run. On a model that runs adaptive thinking by default it bought nothing. `test/prompt_surface.test.js` now fails the build on thinking-scaffold tokens anywhere on the prompt surface, and on `double-check` / `re-verify` / `confirm-your-work` phrasing with them.
- **The self-check sentence in the per-story review prompt** (`lib/workflows/sprint_pipeline.js`): `buildReviewPrompt` appended *"Confirm the baseline was honored: tests accompany the code and the design is the simplest that satisfies the story (no unearned abstraction)."* to a prompt that already asks for correctness and convention-compliance review against the baseline — a second verify instruction inside one prompt, which drives over-verification on a model that self-verifies. The sentence is gone; the preceding clause still names the baseline path so the reviewer knows where the baseline lives, and no replacement phrasing is introduced. A colocated `lib/workflows/sprint_pipeline.test.mjs` guards both halves: the prompt points at the baseline and issues no self-check instruction.
- **The claimant agent in `adversarial_verify.js`** (`lib/workflows/`, `skills/project-emulate/SKILL.md`): each emulation finding was argued by a claimant and a skeptic in parallel and then judged — but the finding *is* the affirmative claim, so the claimant spent an agent restating its input. The claimant is gone; the judge now receives the finding itself as the affirmative position, weighed against the skeptic's rebuttal. The skeptic stage is unchanged in intent. Per-finding cost drops from three agents to two (a 20-finding run: 60 agents → 40), and the returned shape narrows from `{ finding, claim, skeptic, verdict }` to `{ finding, skeptic, verdict }`. A colocated `lib/workflows/adversarial_verify.test.mjs` guards the two-agent budget by asserting the per-finding agent stages are exactly `skeptic` then `judge`.
- **`review_panel.js` and `/project-cleanup` Phase 5.5** (`lib/workflows/`, `skills/project-cleanup/SKILL.md`): the cleanup flow ran a 4-lens panel (correctness, security, style, tests) over the same diff the per-story review agent in `sprint_pipeline.js` had already reviewed — a second full pass for no new coverage. Phase 5.5 is gone, the now-unreferenced workflow script is deleted, and its manifest/schema surface (the inline manifest entry, the `lens` property on `ReviewVerdictSchema`) goes with it. Security coverage is preserved by folding the security lens's focus (injection sinks, missing authentication, broken authorization, secret exposure, unvalidated input reaching dangerous APIs, unjustified permission expansion) into the surviving per-story review prompt, which runs while story context is still live. A new `test/workflow_references.test.js` guards the invariant in both directions: every workflow a `SKILL.md` invokes ships at `lib/workflows/`, and every workflow shipped there is invoked by a `SKILL.md`.

### Fixed
- **Stages defined relative to the session tier never actually tiered** (`skills/project-orchestrate/SKILL.md`, `project-emulate`, `project-scaffold`, `test/invocation_contracts.test.js`): `resolveAgentTier`'s `ONE_TIER_DOWN` target computes from `sessionModel`, an optional workflow argument that appeared in **none** of the invoking `SKILL.md` files. No caller passed it, `MODEL_TIERS.indexOf(undefined)` returned `-1`, and the resolver returned `{}` — silent inheritance, the exact defect the tiering epic existed to eliminate, reintroduced one level up in the *contract* rather than at the call sites. `adversarial_verify` was fully inert this way, since both its stages are relative. `sessionModel` now appears in all three invocation blocks, naming its accepted values and stating plainly what omission costs. A new `test/invocation_contracts.test.js` guards *resolution* rather than declaration: `agent_tiers.test.mjs` could only see that a tier was declared, never that the declared tier evaporated. Verified live — a run passing `sessionModel: 'opus'` produced 4 haiku, 2 sonnet (the `review` stages), 4 inherit; sonnet had been 0 in every prior run.
- **The installer resolved its target to the filesystem root from a source checkout** (`bin/install.js`): `resolveSkillsDir()` walked ancestors looking for a `node_modules` directory, and its loop terminated at `/`. Installed under `node_modules` that walk finds the consuming project; run from a source checkout — the normal development case — no such ancestor exists, so the loop bottomed out and the installer targeted `/.claude/skills`, writing outside any project. Resolution now falls back to a structural source-checkout check (`bin/` and `skills/` as siblings) and refuses the filesystem root outright rather than degrading silently. `test/install.test.js` covers the source-checkout path, the `node_modules` path, the global path, and three refusal cases.

## [2.2.1] — 2026-07-20

### Fixed
- **Serial-in-tree between-story reset destroyed gitignored working-tree files** (`lib/workflows/_shared/reset_worktree.mjs`, inlined into `sprint_pipeline.js`): the reset ran `git clean -fdx -e node_modules …`, and the `-x` flag deletes **every** gitignored path, not just build cruft. On a multi-story batch (the reset only fires between stories, so single-story batches never triggered it) this silently and unrecoverably wiped the skill's own project-local `.claude` install dir, the orchestration's `.claude-scrum-skill` state (backlog, reports, orchestration state), and any `.env*` secrets — mid-run, with no confirmation. The reset now runs `git clean -fd` (no `-x`): without `-x`, git clean never touches any gitignored path, so `node_modules`, `.claude`, `.claude-scrum-skill`, and secrets all survive by construction. The `node_modules` excludes are retained to guard the one remaining edge (a repo that leaves `node_modules` untracked **and** un-ignored). Dropping `-x` removes the hazard as a class rather than enumerating known paths to spare. See ADR-0006 (Amendment 2026-07-19).

## [2.2.0] — 2026-07-07

### Fixed
- **Args normalization missing across every workflow** (`lib/workflows/*.js`): all four workflow entry points (`review_panel.js`, `adversarial_verify.js`, `elaborate_epics.js`, `sprint_pipeline.js`) destructured the injected `args` global directly, so a host that delivers `args` as a **JSON string** silently yielded `undefined` for every field and the workflow no-op'd or crashed. A single shared `normalizeArgs(raw, workflowName)` now handles the string-or-object contract for all four: a non-null non-array object passes through by the same reference; a string is `JSON.parse`d (double-encoded strings re-parsed); and malformed JSON, arrays, primitives, `null`, and post-parse non-objects **throw with the workflow name** rather than defaulting to `{}`. Because the Workflow runtime has no `import()`/`require`, the one canonical `_shared/normalize_args.mjs` is inlined into each script and guarded against drift by a test. See ADR-0006.

### Added
- **Layout-aware isolation in `sprint_pipeline.js`** (`lib/workflows/`): the pipeline now detects whether `node_modules` is tracked (`git ls-files node_modules`) and chooses its execution model per batch. Tracked/vendored deps → `worktree` isolation (unchanged). Untracked deps (the common case) or a non-git/command-error → **serial-in-tree**: stories run fully sequentially in genuine dependency-topological order (Kahn's algorithm), one chain in flight, with a dependency-preserving between-story reset (`git reset --hard` → `git checkout -f <releaseBranch>` → `git clean -fdx -e node_modules …`) that **preserves every `node_modules` (root + nested)** so there is no per-story reinstall. This fixes the prior assumption that a fresh `git worktree add` (tracked files only) could build against gitignored dependencies. An optional `isolationStrategy: 'auto' | 'worktree' | 'serial-in-tree'` arg (default `'auto'`) lets an operator force a strategy; forcing `'worktree'` on untracked deps warns and proceeds. Existing callers are unaffected. See ADR-0006.
- **Automated unit tests for the extracted logic** (`lib/workflows/_shared/*.test.mjs`, `npm test`): `node --test` coverage for the normalizer (E1), layout detector against real git in temp dirs (E2), topological ordering incl. adverse-order and cycle throw (E3), the dependency-preserving reset (E4), and the sequential driver (E5) — plus an inline-drift guard. `docs/M1-manual-e2e-gate.md` documents the manual end-to-end gate.

### Changed
- **Installer keeps colocated tests out of the payload** (`bin/install.js`): `copyRecursive`'s `skipPath` parameter is generalized into a skip predicate that filters `*.test.*` from the workflow copy, and a post-install smoke check asserts the shared `_shared/*.mjs` modules are present/importable and that no test files shipped.
- **`project-orchestrate/SKILL.md`**: added the optional `isolationStrategy` arg to the `sprint_pipeline` invocation block and reconciled the stale worktrees / `min(16, cpu_cores-2)` concurrency / "serialized behind a lock" paragraph into a two-execution-model description (worktree vs serial-in-tree).

## [2.1.3] — 2026-07-06

### Fixed
- **Guidance skills were never installed** (`bin/install.js`): the `design-patterns` and `domain-modeling` situational-guidance skills shipped under `skills/` but were absent from the installer's hardcoded copy list, so `postinstall` never created `.claude/skills/design-patterns/` or `.claude/skills/domain-modeling/` in any consumer install (1.7.0–2.1.2). `/project-orchestrate`'s vague "resolve the absolute `SKILL.md` paths" instruction then caused flaky injection for `core`-subdomain epics — thorough runs hunted the files down in `node_modules`, lazy runs silently fell back to the baseline. The two skills now live in `lib/guidance/` and install to the non-registered `_guidance/` directory via a dedicated `installGuidance()` step, mirroring how `lib/workflows/` ships to `_workflows/`. `/project-orchestrate` resolves them by a fixed, install-layout-agnostic path (`<skills-root>/_guidance/…`), so injection is deterministic and they stay out of the user-facing skill registry. See ADR-0005.

## [2.1.2] — 2026-06-24

### Fixed
- **Installer no longer destroys user config on upgrade** (`bin/install.js`): the npm `postinstall` recopied `skills/shared/config.json` unconditionally, wiping user settings (output `paths`, `jira`/`trello` keys, `scaffold` thresholds) on every install. `config.json` is now treated as the single user-owned file: fresh installs copy the default verbatim; upgrades deep-merge shipped defaults with the existing file (user values win, new default keys flow in); a malformed config is backed up to `config.json.bak` before a fresh default is written. Orphan keys (absent from defaults) are preserved, not pruned; arrays are treated as leaf values. Every other file in the install tree still overwrites unconditionally.

### Added
- **Installer unit tests** (`test/install.test.js`, `npm test`): a zero-dependency `node:test` suite (16 cases) covering `deepMerge` and `installConfig`. The install logic is now importable without side effects (entrypoint guarded by `require.main === module`). See ADR-0004.

## [2.1.1] — 2026-06-21

### Fixed
- **Sprint pipeline git race** (`lib/workflows/sprint_pipeline.js`): story chains ran concurrently in one shared working tree, so parallel `git checkout -b` + commits (and, in local mode, fan-in merges into the release branch) could corrupt one another — worsened by intra-epic file overlap. The execution model now holds one invariant: the main working tree is mutated only by a serialized local-mode merge step. Implement and verify run in isolated git worktrees, review diffs refs without checking out, and local-mode merges into the shared release branch are serialized behind a lock. This is a pre-existing flaw dating to the v2.0.0 foundation, not a 2.1.0 regression; the engineering baseline added in 2.1.0 made stories touch more files and surfaced it more often.
- **In-batch dependency gating** (`lib/workflows/sprint_pipeline.js`): the pipeline now re-enforces story dependencies itself rather than relying solely on the orchestrator's pre-filter — a story whose `blocked_by` names another story in the same batch waits for that story to finish `done` and branches only after it has merged. A crashed or `null` story chain now degrades to a `failed` result instead of tearing down the whole batch.

## [2.1.0] — 2026-06-20

### Added
- **Engineering baseline** (`skills/shared/references/ENGINEERING_BASELINE.md`): an always-on engineering standard — Clean Code, Test-Driven Development, and a simple-design "Arbitration Rule" — that `project-spec` reads at design time and `project-orchestrate` injects into every implementation and review subagent. Order of precedence: project `CLAUDE.md` > engineering baseline > situational guidance.
- **`design-patterns` skill**: a counterweight-first Gang of Four pattern catalog (all 23, paraphrased) used to name candidate patterns at design time and refactor toward them during core-domain implementation. Surfaces only on a demonstrated design smell; dormant on CRUD, scripts, and glue code.
- **`domain-modeling` skill**: tactical Domain-Driven Design guidance (entities, value objects, aggregates, repositories, services, factories, ubiquitous language) for complex core domains. Dormant on CRUD and generic/supporting subdomains per Evans's own scoping.
- **Epic `subdomain` classification** (`core` / `supporting` / `generic`): added to `SpecSchema` and persisted by `project-scaffold` into epic metadata (`_epic.md` frontmatter in local mode; a `subdomain:<value>` label in remote modes). This is the single authoritative source `project-orchestrate` reads to gate situational guidance to core-domain epics.
- **Design record** at `docs/specs/20260618_132133_design_guidance_layering.md` documenting the placement rationale, the spec → scaffold → orchestrate → pipeline data flow, and the source-grounding pass.
- **Source attribution**: `NOTICE` and a new README "Acknowledgments" section credit *Clean Code* (Robert C. Martin), *Test-Driven Development: By Example* (Kent Beck), *Domain-Driven Design* (Eric Evans), and *Design Patterns* (the Gang of Four) as the intellectual sources of the engineering guidance. The guidance is expressed in the project's own words — no verbatim text from the source works.

### Changed
- **`/project-spec`** runs two new design passes: a strategic-DDD pass (captures the ubiquitous language and classifies each epic's `subdomain`) and a GoF candidate pattern-naming pass (patterns are named only as `candidate / justified / revisitable`, never binding). Emits `subdomain` per epic in the `.spec.json` sibling.
- **`/project-orchestrate`** reads the engineering baseline and mandates it for every spawned subagent; reads each epic's `subdomain` and passes `baselinePath` (always) plus `situationalGuidance` (the `design-patterns` and `domain-modeling` skills, for `core` epics only) to the sprint pipeline.
- **`/project-scaffold`** persists the epic `subdomain` from the spec into epic metadata and into the Pass-1 epic skeleton.
- **`sprint_pipeline.js`** threads `baselinePath` (injected into every story) and `situationalGuidance` (core-domain stories only) into the implementation and review subagent prompts.
- **`SpecSchema`** Epic definition gains an optional `subdomain` enum (`core` / `supporting` / `generic`).
- **`marketplace.json`** now registers `spec`, `design-patterns`, and `domain-modeling` (the first was previously omitted).

### Migration

**Users:** zero migration effort. Same slash commands, prompts, and artifact files. The engineering baseline now shapes generated code (tests-first, simpler designs, earned abstractions) — a behavioral enhancement, not an interface change. Specs and backlogs produced by earlier versions still work: an epic with no `subdomain` classification is treated as generic and simply receives the baseline without the situational pattern/DDD guidance. No schema field is newly required; `subdomain` is optional.

## [2.0.0] — 2026-05-30

### Added
- **Two-layer architecture** (see [ADR-0003](docs/adrs/0003-workflow-backed-re-plumbing.md)): skills (markdown SKILL.md) own the opinion + user surface; workflow scripts (JavaScript at `lib/workflows/`) own the fan-out substrate. Skills invoke workflows via the Claude Code Workflow tool using a Path Resolution Algorithm (walk up from SKILL.md to the skills root, then descend into `_workflows/`).
- **4 workflow scripts** at `lib/workflows/`: `sprint_pipeline.js` (per-story sprint execution as a pipeline), `elaborate_epics.js` (Pass 2 of two-pass scaffolding as one parallel wave), `adversarial_verify.js` (claimant/skeptic/judge verification of emulation findings), `review_panel.js` (multi-lens parallel review with aggregated verdict). The multi-spec sequential queue is implemented in the skill markdown rather than as a workflow because per-spec orchestration internally invokes other workflows, and the Workflow tool's nesting constraint (one level only) precludes a queue-workflow → per-spec-workflow → leaf-workflow chain.
- **8 JSON Schemas** at `lib/workflows/schemas/`: `SpecSchema`, `EpicSchema`, `StorySchema`, `EmulationFindingSchema`, `ReviewVerdictSchema`, `SprintStoryReturnSchema`, `ScaffoldOutputSchema`, `PRDFrontmatterSchema` (all JSON Schema Draft 2020-12). Cross-skill type system for schema-validated workflow returns.
- **`bin/install.js`** copies `lib/workflows/` to `<install-dir>/_workflows/` during postinstall (underscore prefix prevents Claude Code from registering it as a skill).
- **README "Architecture" section** for contributors documenting the layered model, the shipped workflows and schemas, and the convention for adding new workflows.
- **README v2.0.0 runtime callout** near Installation: notes that v2.0.0 requires Claude Code with the Workflow tool, and points users on older Claude Code installs to `npm install --save-dev @houseofwolvesllc/claude-scrum-skill@1.8.1` as a fallback.
- **`/project-orchestrate` Before You Start item 0**: Workflow-tool availability check with explicit abort + v1.8.x fallback guidance.
- **`/project-emulate` Phase 5.5**: Adversarial Verification of Findings (invokes `adversarial_verify.js`).
- **`/project-cleanup` Phase 5.5**: Multi-Lens Review Panel (invokes `review_panel.js`).
- **`/project-spec` schema-validated sibling output**: in addition to the markdown spec, writes a sibling `<timestamp>_<name>.spec.json` conforming to `SpecSchema`.
- **ADR-0003** at `docs/adrs/0003-workflow-backed-re-plumbing.md` documenting the architectural shift, alternatives considered, and consequences.
- **`package.json` `files` field** includes `lib/` so workflows ship in the published tarball.

### Changed
- **`/project-orchestrate` Phase 1 Step 3 (Story Execution)** rewritten to invoke `sprint_pipeline.js`. Concurrency lifts from a hardcoded 3 to up-to-`min(16, cpu_cores - 2)` per the Workflow tool's cap; per-stage barriers are removed (the barrier-removal benefit is unconditional). Pre-spawn checks (independence, persona resolution, human/cowork skip) and post-workflow persistence are documented inline. Replaces ~80 lines of Task-spawning subagent-prompt prose.
- **`/project-orchestrate` Sequential Multi-Path Mode Per-Spec Loop** rewritten to be executed by the skill markdown directly (no wrapping workflow). The per-spec body still invokes the per-skill workflows (`sprint_pipeline.js`, `elaborate_epics.js`, `adversarial_verify.js`, `review_panel.js`) for each spec; the queue lifecycle (iteration order, `--skip-on-pause`, queue state file updates) is markdown-driven. This respects the Workflow tool's "one level of nesting only" constraint.
- **`/project-scaffold` Two-Pass Procedure Pass 2** rewritten to invoke `elaborate_epics.js`. Pass 1 narration (single-agent skeleton extraction) unchanged.

### Removed
- **Task-spawning narrative prose** in `/project-orchestrate` Phase 1 Step 3 (the verbose subagent-prompt-structure block, the persona-routing bash snippets, the concurrency-3 cap text). Replaced by a thin Workflow-invocation directive.
- (Scope note: `/code-review` was originally listed as a rewrite target in the source spec. It is a Claude Code first-party skill not shipped in this package; the v2.0.0 review-panel work is scoped to `/project-cleanup` only.)
- **Pass 2 fan-out narrative prose** in `/project-scaffold` Two-Pass Procedure. Replaced by a workflow invocation.

### Migration

**Users:** zero migration effort. Same slash commands. Same prompts. Same artifact files (state files, ADRs, CONTEXT.md, queue state file). Same backend-mode semantics (local / GitHub / Jira / Trello). The user-facing surface is byte-for-byte unchanged.

**Runtime requirement:** v2.0.0 requires a Claude Code version that exposes the **Workflow tool**. Modern Claude Code (latest CLI auto-updated, desktop app, web app, IDE extensions) all include it. If your CLI is months out of date and not auto-updating, run `npm update -g @anthropic-ai/claude-code` before upgrading. Users who cannot or do not want to update Claude Code should pin to the fallback:

```bash
npm install --save-dev @houseofwolvesllc/claude-scrum-skill@1.8.1
```

**Plugin / extension authors** who hooked into the v1.x verbose Task-spawning prose sections in `/project-orchestrate` Phase 1 Step 3, `/project-scaffold` Pass 2, or the multi-spec queue per-spec loop will need to update — those sections are now thin Workflow-invocation directives. Hook into the workflow scripts directly (`lib/workflows/<name>.js`) if extending behavior, or invoke the underlying agents through the Workflow tool.

**State file backward compatibility:** v2.0.0 reads existing `orchestration-state.md`, `orchestration-state-<slug>.previous.md`, and `orchestration-queue-state.md` files in their v1.8.x markdown format. Mid-run upgrades (start on v1.8.1, finish on v2.0.0) work — the state files are interchangeable.

## [1.8.1] — 2026-05-28

### Changed
- README install instructions now recommend `npm install --save-dev` (or `-D`) for local installs. The previous wording implicitly saved to `dependencies`, which shipped the package to production installs, ran the postinstall in environments where `~/.claude/skills/` doesn't exist, bloated Docker layers and audit output, and semantically misrepresented the package — it's developer tooling (Claude Code at planning/build/iteration time), peer to `eslint`/`prettier`/`vitest`. Includes an explanatory callout under the install snippet. Patch release to refresh the README shown on npmjs.com — npm's package page is updated from the README in the published tarball, so a publish is required for the corrected install instructions to reach npm consumers.

## [1.8.0] — 2026-05-28

### Added
- **Sequential multi-path mode in `project-orchestrate`.** When invoked with 2+ existing-file PRD paths (e.g., `/project-orchestrate spec-1.md spec-2.md spec-3.md`), each spec receives its own complete orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) end-to-end before the next begins. Each spec keeps its own design-spike (if triggered), emulation, cleanup, and ADR — no cross-spec contamination. New default for multi-path invocation; replaces v1.7.x's undefined agent-improvised merge behavior.
- **`depends_on` PRD document frontmatter** for declaring inter-spec execution-order constraints. Topological sort with stable tie-break on argument order. Cycles (including self-loops) and missing dependencies abort the run before any spec starts, with explicit error messages naming the cycle members or the missing entry.
- **`--skip-on-pause` flag** (default off): in multi-path mode, a spec whose orchestration pauses on a safety gate is marked `skipped`, its state file archived with `.skipped.md` suffix, and the queue advances to the next spec. Without the flag, the queue pauses and waits for resolution.
- **`--merged` flag** (default off): opt-in for the pre-1.8.0 best-effort unified-multi-spec behavior. Emits a deprecation-style warning that formal merged semantics are deferred to a follow-up spec.
- **Queue state file** at `.claude-scrum-skill/orchestration-queue-state.md` tracking the multi-path run: resolved execution order, per-spec status (pending / in-progress / completed / paused / skipped), aggregate stats, append-only log. Resumable on safety-gate pause; archived to `.previous.md` on clean completion.
- **Slug-suffixed per-spec state archives** in multi-path mode: `orchestration-state-<spec-slug>.previous.md` on completion, `orchestration-state-<spec-slug>.skipped.md` on `--skip-on-pause` pause. Slug derived from `basename(path, ".md")`; slug collisions abort before run.
- **Cumulative summary** at end of multi-path run: per-spec sections plus aggregate header (specs in queue, completed/paused/skipped counts, total stories, sprints, ADRs, duration).
- New CONVENTIONS.md section "PRD Document Frontmatter" documenting the `depends_on` field.
- README "Invocation Patterns" table and "Multi-Path Flags" / "Inter-Spec Dependencies" subsections under Autonomous Orchestration.

### Changed
- `project-orchestrate` Input section gains item 5 documenting multi-path invocation; new top-level "Input Parsing and Mode Detection" section formalizes the seven-case classification table (5 valid modes + 1 mixed-arg error + glob expansion fallback) and the flag parsing rules.
- `project-orchestrate` Phase 3 Step 17 (state file cleanup) now suppressed in multi-path mode — the wrapper handles archival with the slug-suffixed naming instead. Single-spec mode lifecycle is unchanged from v1.7.1.
- Backward compatibility: single-path (`/project-orchestrate spec.md`), repo-identifier (`/project-orchestrate owner/repo`), single-path + repo-identifier, and no-arg (`/project-orchestrate`) invocations are all unchanged from v1.7.1.

## [1.7.1] — 2026-05-27

### Changed
- `project-orchestrate` "Default Operating Mode" section rewritten in terse imperative voice. The 1.7.0 version was verbose policy text (~50 lines, enumerated allowed pauses, multiple subsections) that didn't reliably override a cautious agent's pre-flight audit instinct. The 1.7.1 version is ~15 lines, command-voice throughout, and explicitly forbids the "list concerns then ask which option" anti-pattern observed in practice. Functional behavior unchanged — same mandatory phases, same four safety gates, same state-file automation.

## [1.7.0] — 2026-05-27

### Added
- Two-pass scaffolding mode in `project-scaffold` — when triggered, splits PRD parsing across one skeleton-extraction agent (Pass 1) and one elaboration subagent per epic (Pass 2, max 3 concurrent). Keeps per-epic context tight on large PRDs so the last epic's stories are as well-specified as the first. Triggers in precedence order: CLI flag → PRD frontmatter (`scaffold_mode`) → word-count threshold (`scaffold.two_pass_threshold_words`, default 5000). Auto-downgrades to single-pass elaboration when Pass 1 yields ≤ 2 epics; degrades gracefully on Pass 1 / Pass 2 failure.
- Design-spike epic auto-injection in `project-scaffold` — prepends a research-driven pre-epic at position 0 when triggered. Stories produce one foundational ADR + one CONTEXT.md per implementation epic. Implementation epics are gated via the existing `blocked_by` mechanism; sprint planning naturally waits for the design-spike epic to complete before selecting implementation stories.
- CONTEXT.md template at `skills/shared/templates/CONTEXT-template.md` with seven required sections (Overview, Naming Conventions, File Layout, Shared Types & Interfaces, Patterns to Follow, Patterns to Avoid, External References).
- ADR template at `skills/shared/templates/ADR-template.md` following the Michael Nygard format.
- Config keys: `scaffold.two_pass_threshold_words` (default 5000), `scaffold.design_spike_enabled` (default true), `paths.context` (default `.claude-scrum-skill/context`).
- PRD frontmatter controls: `scaffold_mode: single-pass | two-pass`, `design_spike: true | false`. CLI flag equivalents (`--mode`, `--design-spike` / `--no-design-spike`) documented.
- Verification fixtures at `docs/specs/_fixtures/` (small PRD, large PRD, README with 9-case verification matrix from the source spec's Testing Strategy).
- `type:design-spike` label and `epic_type: design-spike` frontmatter field for canonical design-spike epic detection across all four backends (local, GitHub, Jira, Trello).
- ADR-0001 documenting the architectural decisions behind two-pass scaffolding and the design-spike epic.

### Changed
- `project-orchestrate` defaults to **fully autonomous execution**. A new "Default Operating Mode" section at the top of the skill mandates: no routine confirmation prompts, no skipping of Phase 2 (Emulation) or Phase 3 (Cleanup), and automatic state-file handling on resume/restart (paused-state files resume without prompting; completed-state files are archived as `orchestration-state.previous.md` and a fresh run starts). Only the four safety gates pause the run — unresolvable merge conflict, critical review finding, 3rd dirty hardening run, rate-limit exhaustion. The State Management section's startup decision tree is simplified accordingly, and Phase 2 / Phase 3 are explicitly marked **mandatory** to prevent skip-when-clean drift. Per-invocation interactive overrides remain honored when the user explicitly asks for them.
- `project-orchestrate` Step 3 subagent prompt instructs subagents to read the epic's `CONTEXT.md` (when present) in addition to `CLAUDE.md` before writing code; CONTEXT.md sections override generic CLAUDE.md conventions for that epic.
- `project-orchestrate` Step 16 ADR creation now explicitly shares a single sequential numbering pool with design-spike ADRs and hand-authored ADRs (next number = `max(existing) + 1`).
- `project-orchestrate` Step 2 sprint planning explicitly affirms the `blocked_by` gate so implementation stories naturally wait for their design-spike blockers to complete.
- `CONVENTIONS.md` documents the `type:design-spike` label, the `epic_type: design-spike` frontmatter field (local mode), and the design-spike epic workflow under Epic Structure.
- `README.md` documents the new Two-Pass Mode and Design-Spike Epic features, the new config keys, the PRD frontmatter overrides, and updates the Autonomous Orchestration Phase 1 flow to thread the design-spike epic.
- Single-pass behavior preserved — small PRDs (single epic, < 5000 words, no frontmatter overrides) continue through the original path unchanged. Backward compatible.

## [1.1.0] — 2026-02-16

### Changed
- Three-tier branch model: story → release → development → main (adds development as sprint approval gate)
- Expanded `project-emulate` walkthrough lifecycle with detailed sub-steps per stage
- Improved `sprint-plan` with structured proposed sprint output table
- Enhanced `sprint-release` with detailed PR body template, milestone closing, and error handling
- Added release branch health and actionable recommendations to `sprint-status`
- Simplified board views in `CONVENTIONS.md` (6 → 5 views)
- Added `rolled-over` status signal label to `CONVENTIONS.md`
- Updated README branch strategy to reflect three-tier model

### Removed
- Removed `allowed-tools` and `argument-hint` from skill frontmatter

## [1.0.0] — 2026-02-16

### Added
- `project-scaffold` — Scaffold GitHub Projects from PRD documents
- `sprint-plan` — Plan and populate sprint iterations
- `sprint-status` — Generate sprint progress reports
- `sprint-release` — Close sprints and open release PRs
- `project-emulate` — Full walkthrough coverage testing across all roles and lifecycle stages
- Shared `CONVENTIONS.md` for consistent project management standards
- npm package with auto-install to `~/.claude/skills/`
- Claude Code plugin marketplace support via `marketplace.json`
