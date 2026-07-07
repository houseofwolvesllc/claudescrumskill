# CONTEXT — repo-layout-detection

> Design anchor from the design-spike epic. See ADR-0006 and the spec. Read the
> args-normalization CONTEXT.md first for the runtime reality and inlining pattern.

## Runtime reality

No `child_process` in the workflow runtime — the pipeline cannot run `git`
directly. Detection logic is split:

- **Pure classifier (inlined, runs in-runtime):**
  `classifyIsolationStrategy(lsFilesStdout, commandErrored)` →
  `'worktree' | 'serial-in-tree'`.
- **execGit-injected convenience (tests only):**
  `detectIsolationStrategy(repoRoot, execGit)` runs `git ls-files node_modules`
  via the injected runner and calls the classifier. Unit tests inject a real
  `execSync`-backed runner against temp repos (E2). Never called in the runtime.

In `sprint_pipeline.js`, the git stdout is obtained via an `agent(...)` call, then
fed to the inlined `classifyIsolationStrategy`.

## Naming & file layout

- `lib/workflows/_shared/detect_repo_layout.mjs` + `detect_repo_layout.test.mjs` (E2).

## Detection axis (F8, F9, F9a)

`git ls-files node_modules`: **non-empty stdout → `worktree`** (tracked/vendored);
**empty stdout (exit 0) → `serial-in-tree`** (untracked, the common case);
**command error / non-git (exit 128, caught) → `serial-in-tree`** (safe default).
Branch on empty-vs-nonempty stdout; try/catch only the command-error case; a
detector throw NEVER kills the batch.

## Strategy resolution in sprint_pipeline.js (F5, F9b, F10)

After the empty-batch guard: honor optional
`isolationStrategy?: 'auto' | 'worktree' | 'serial-in-tree'` (default `'auto'`;
token exactly `'serial-in-tree'`; no env var). `'auto'` → detect; concrete value
→ force it. Forcing `'worktree'` on untracked `node_modules` → prominent `log()`
warning, then warn-and-proceed. `log()` the strategy, the evidence
(empty/non-empty/command-error), and the source (auto vs override).

## SKILL.md reconciliation (F9c — owned here)

`skills/project-orchestrate/SKILL.md`: add optional `isolationStrategy` to the
args block (~405–416) and holistically reconcile the paragraph at ~428–432 — the
"isolated git worktrees", `min(16, cpu_cores-2)`, and "serialized behind a lock"
claims are all now mode-conditional (false under serial-in-tree). Mirror to
`.claude/skills/project-orchestrate/SKILL.md` if that copy carries the same text.
