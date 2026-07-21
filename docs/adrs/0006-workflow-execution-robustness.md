# ADR-0006: Workflow Execution Robustness — Inlined Shared Logic and Layout-Aware Isolation

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Keith Garcia (project owner)

## Context

Running `/project-orchestrate` against a repo whose `node_modules` is untracked
surfaced two structural defects in the v2.0.0 Workflow scripts under
`lib/workflows/` (see `docs/specs/20260706_235230_workflow_execution_robustness.md`):

1. **Args normalization is missing across every workflow.** All four entry
   points destructure the injected `args` global directly, so a host that
   delivers `args` as a JSON string yields `undefined` for every field.
2. **Worktree isolation assumes `node_modules` is materialized.**
   `sprint_pipeline.js` runs Implement/Verify agents in fresh git worktrees; a
   fresh `git worktree add` materializes tracked files only, so gitignored
   `node_modules` is absent and every `tsc`/`jest` fails.

The spec gated all implementation on two runtime spikes (S1, S2) whose findings
could materially reshape scope. This ADR records what the spikes found and the
architecture that follows, because the findings were **more restrictive than the
spec assumed** and the design branches on them.

### Spike findings (empirical, 2026-07-07)

Probed by running throwaway scripts through the real Workflow tool:

- **S1 — worktree overlay:** `isolation: 'worktree'` performs a **plain
  `git worktree add`** at `.claude/worktrees/<runId>-N`. An untracked sentinel
  file placed in the live tree was **absent** in the worktree. Untracked
  `node_modules` is therefore absent → **Defect 2 is real; scope does NOT
  collapse.** The detector and serial-in-tree work are required as specified.
- **S2 — dynamic import:** `await import('./_shared/x.mjs')` fails with
  **"import() is not available in workflow scripts."** A capability probe further
  found `require`, `module`, `exports`, and `process` are all **`undefined`**,
  and `import.meta` is a **SyntaxError**. The only globals are `log, phase,
  console, budget, setTimeout, clearTimeout, Date, agent, parallel, pipeline,
  workflow, args`.

The runtime thus offers **no module-loading mechanism at all** (no `import()`,
no `require`, no static `import`, no runtime-provided base) **and no
shell/`child_process`.** This is stronger than the spec's S2 framing (which
asked only whether *relative-specifier* resolution worked) and it eliminates the
"runtime-provided base" fallback branch outright.

## Decision

Adopt the spec's **S2-negative** path, realized as follows.

### 1. Shared logic is a single tested source, inlined into scripts

Each risky routine has exactly one canonical definition as a pure ESM module
under `lib/workflows/_shared/*.mjs`, unit-tested with `node --test`
(`normalize_args`, `detect_repo_layout`, `topological_order`, `reset_worktree`,
`run_sequential`). Because the runtime cannot load modules, the logic is
**inlined into each consuming workflow script** inside delimited
`BEGIN/END inlined from _shared/<module>` blocks. A drift test
(`_shared/inline_sync.test.mjs`) asserts every inlined block equals the
canonical module (exports stripped, whitespace-normalized), so DRY is preserved
at the source level and the inlined copies cannot silently drift. This is the
spec's "installer-codegen-from-single-source" fallback, realized as
**pre-inlined source + drift test + verbatim copy** — equivalent DRY outcome,
simpler than install-time codegen, and it gives the fallback the automated
coverage the spec flagged as missing.

Consequence: the **import-failure blast radius (F2a) evaporates** — inlined code
cannot be "unresolvable," so there is no fail-loud `await import()` wrapper to
write. Fail-loud lives entirely in `normalizeArgs` itself (throws with context).

### 2. Git/filesystem work is delegated to `agent()`

The runtime has no `child_process`, so a workflow script cannot run `git`
directly. Shared modules therefore expose **pure decision logic** that is
inlined and run in-process (`classifyIsolationStrategy(stdout, errored)`,
`topologicalOrder(stories)`, `runSequential(...)`, `resetWorktreeCommands(rb)`),
while the **execution** of git is delegated to `agent(...)` prompts. The same
modules also export a thin `execGit`-injected convenience
(`detectIsolationStrategy`, `resetWorktree`) used **only by the unit tests** to
drive the logic against real git in temp dirs — never called in the runtime.

### 3. Detection axis and serial-in-tree design (unchanged from spec)

`node_modules` **tracked** (`git ls-files node_modules` non-empty stdout) →
`worktree`; **untracked** (empty stdout) → `serial-in-tree`; non-git / command
error → `serial-in-tree` (safe default, never throws to the batch). Serial-in-tree
runs stories fully sequentially in genuine dependency-topological order (Kahn),
one chain in flight, with a dependency-preserving between-story reset
(`git reset --hard` → `git checkout -f <releaseBranch>` →
`git clean -fdx -e node_modules -e '**/node_modules'`, in that exact order). No
lock is reintroduced; zero concurrency dissolves R1/R2.

## Consequences

- **Cleaner than the S2-positive path.** No dynamic-import wiring, no
  import-failure blast radius, no fail-loud import wrappers. The single source of
  truth is the tested `.mjs`; scripts carry a generated-and-verified copy.
- **`bin/install.js` change is minimal**, exactly as the spec preferred: a
  `skipPath` → skip-predicate generalization that filters `*.test.*` from the
  workflow copy (so colocated tests do not ship), plus migrating the existing
  exact-path caller. No install-time codegen. A post-install smoke check asserts
  `_shared/*.mjs` are present/importable and no `*.test.*` shipped.
- **`node --test` is the automated gate (E1–E5)**; the full end-to-end run
  against the real Workflow runtime is the documented manual gate (M1).
- **The runtime constraints are now recorded** (this ADR) so future workflow work
  does not re-derive them or assume `import`/`require`/`child_process` exist.

## Amendment (2026-07-19): between-story reset drops `-x`

The between-story reset as originally shipped (§3) ran
`git clean -fdx -e node_modules -e '**/node_modules'`. The `-e node_modules`
guard reasoned about exactly one gitignored path and stopped there — but `-x`
makes the blast radius **every** gitignored path. On a real repo that is not
just build output: it is the skill's own project-local `.claude` install dir, the
orchestration's `.claude-scrum-skill` state (backlog, orchestration state,
reports), and any `.env*` secrets. Because the reset only fires between stories
(`index > 0`), the hazard stayed latent until the first multi-story batch, then
silently and unrecoverably deleted all of the above mid-run.

The reset now runs **`git clean -fd`** (no `-x`) — `git reset --hard` →
`git checkout -f <releaseBranch>` → `git clean -fd -e node_modules -e '**/node_modules'`.
Dropping `-x` removes the hazard as a **class** rather than enumerating paths to
spare: git clean without `-x` never touches a gitignored path, so `node_modules`,
`.claude`, `.claude-scrum-skill`, and `.env*` all survive by construction. The
`node_modules` excludes are retained to guard the one remaining edge — a repo that
leaves `node_modules` untracked **and** un-ignored, where a bare `-fd` would
delete it. The reset's essential job (return tracked files to a clean
release-branch state) is unchanged; the only behavioral difference is that
gitignored build artifacts (`dist/`, coverage when ignored) now survive the
reset, which is strictly safer and correct for a tool operating inside a user's
repo. Canonical source and tests: `lib/workflows/_shared/reset_worktree.mjs`
(E4). This supersedes the `git clean -fdx …` command in §3 above.
