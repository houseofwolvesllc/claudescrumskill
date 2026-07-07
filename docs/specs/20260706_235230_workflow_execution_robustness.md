# Workflow Execution Robustness — Host-and-Layout Compatibility

> **Document type: Engineering hardening spec.** Two real defects surfaced by
> running `/project-orchestrate` against a repo whose `node_modules` is
> untracked (`stolarch`). Both are structural compatibility gaps in the v2.0.0
> Workflow scripts under `lib/workflows/`, not feature work. The valuable
> artifact here is the **acceptance criteria** — realized as **automated unit
> tests** that exercise the extracted risky logic against **real git in temp
> dirs**, plus one **documented manual end-to-end gate** against the real
> Workflow runtime. The fix is not "done" until every regression it claims to
> fix is proven, not the happy path. **Implementation is gated on two runtime
> spikes (S1, S2); no feature code starts until both are resolved** (see the
> `runtime-behavior-spikes` epic and the top-level `design_spike` flag).

## Overview

The v2.0.0 skills delegate their heavy lifting to Workflow scripts that ship at
`<skills-root>/_workflows/*.js` (source of truth: `lib/workflows/*.js`). These
scripts run inside the Claude Code **Workflow tool** runtime, which injects a set
of globals — `args`, `log`, `phase`, `agent`, `parallel` — and expects each
script to read its inputs from the `args` global.

Running `/project-orchestrate` end-to-end against `stolarch` (a repo whose
per-package `node_modules` is **gitignored / untracked**) exposed two
independent defects that both prevent the pipeline from completing:

1. **Args normalization is missing across *every* workflow.** Each entry point
   destructures the `args` global directly. On a host that delivers `args` as a
   **JSON string** rather than a parsed object, destructuring silently yields
   `undefined` for every field and the workflow no-ops or crashes. This is a
   **uniform** gap — all four workflow scripts have it — not an inconsistency
   between two files.

2. **Worktree isolation assumes `node_modules` is materialized in a fresh
   worktree.** `sprint_pipeline.js` runs the Implement and Verify agents in
   fresh git worktrees (`isolation: 'worktree'`, lines 301 and 317). A fresh
   `git worktree add` materializes **tracked files only**; gitignored
   `node_modules` is therefore absent unless the repo **commits/vendors** it.
   In the near-universal case where `node_modules` is untracked, the worktree is
   dependency-empty and every `tsc`/`jest` invocation fails.

Neither defect is a variant of the other: the args gap is a host-delivery
contract mismatch fixed by a shared normalizer; the isolation gap is a
tracked-vs-untracked-`node_modules` assumption fixed by detecting whether deps
survive into a fresh worktree and choosing the execution strategy accordingly.
This spec resolves both, and mandates a verification phase that reproduces each
failure mode and proves the fix.

**Two runtime facts gate the whole plan and are resolved *first* as spikes:**
whether this runtime's `isolation: 'worktree'` overlays untracked files (S1 —
if it does, Defect 2 largely evaporates and the layout detector plus
serial-in-tree work are **largely unnecessary**, collapsing scope) and whether
relative-specifier `await import()` resolves in the wrapped-eval runtime across
source and installed layouts (S2 — the delivery mechanism for **all** `_shared`
modules). These are encoded as the first epic (`runtime-behavior-spikes`), on
which every other epic `depends_on`.

### Grounding research (verified against source)

This section records what was confirmed by reading the code, so the
implementation does not re-derive it or drift from reality.

**A. Does a shared args-normalizer already exist? → No.**
There is no `normalizeArgs`, no `JSON.parse(args)`, no `typeof args` guard, and
no shared utility imported by any workflow. A grep across `lib/` for
`normalizeArgs`, `JSON.parse(args)`, and `typeof args` returns nothing. The
`lib/` tree contains only `lib/guidance/**`, `lib/workflows/*.js`, and
`lib/workflows/schemas/*.json` — there is **no shared workflow-helper module and
no directory for one**. None of the four workflow scripts contain a single
`import` statement today. **Therefore the fix is "create the helper," not "wire
the files into an existing one."**

**B. The workflow scripts run in a wrapped-eval runtime, not real ESM/CJS.**
Each script simultaneously contains a top-level `export const meta` (e.g.
`sprint_pipeline.js:47`), a top-level `return` (`sprint_pipeline.js:142` and
`:360`), and top-level `await` (`adversarial_verify.js:141`). Those three
constructs are **jointly illegal** in any real ES module or CommonJS module —
they only coexist when the source is wrapped and `eval`-ed (or run as an async
function body) by the Workflow tool. The practical consequence for this spec:

-   A static `import { normalizeArgs } from './_shared/normalize_args.mjs'`
    declaration is a **likely SyntaxError** in a wrapped-eval body (import
    declarations are only legal at true module top level).
-   Top-level `await` is **confirmed supported** (the runtime already relies on
    it). Therefore `await import('./_shared/<module>.mjs')` — a dynamic import
    expression — is the **candidate single-source-of-truth** delivery mechanism
    for **every** `_shared` module, not just the normalizer. Two residual risks
    attach to it and apply uniformly to all `_shared` imports: how the runtime
    resolves a **relative specifier** for a dynamic import (Open Spike S2), and
    the **blast radius** of an unresolvable import (see F2a and D1) — a top-level
    `await import(...)` runs *before* any per-story `.catch` isolation, so a
    failed import aborts the **entire** workflow invocation.

**C. Every workflow entry point reads `args` directly (the DRY scope).**
The normalizer must cover **all four** scripts under `lib/workflows/`, not just
the two named in the defect report. Each destructures the `args` global:

| Workflow script | Line | Destructure of `args` |
|---|---|---|
| `lib/workflows/review_panel.js` | 47 | `const { diff, files, lenses = DEFAULT_LENSES, projectConventionsPath } = args` |
| `lib/workflows/adversarial_verify.js` | 47 | `const { findings, codebaseContext = {} } = args` |
| `lib/workflows/elaborate_epics.js` | 62 | `const { skeleton, prdPath, conventionsPath } = args` |
| `lib/workflows/sprint_pipeline.js` | 127–138 | `const { stories, epicSlug, releaseBranch, … situationalGuidance = [] } = args` (block closes with `} = args` at line 138) |

Because the identical `... = args` pattern appears **four** times, the repo's
earned-abstraction rule (CLAUDE.md §1.4: "When a pattern appears three times, it
is extracted thoughtfully") is triggered. A copy-pasted shim in each file would
violate it. The fix is a single shared `normalizeArgs()` consumed by all four
via `await import()`.

**D. Packaging ships subdirectories recursively — but colocated tests must be
filtered.** `bin/install.js:122` calls `copyRecursive(WORKFLOWS_SOURCE_DIR,
workflowsDest)` inside `installWorkflows()`. Because the copy is **recursive**, a
new `lib/workflows/_shared/` directory ships to
`<skills-root>/_workflows/_shared/` **automatically** — no new *copy step* is
required. The earlier claim that `bin/install.js` needs a new copy step is
**incorrect** and is dropped. However, `copyRecursive` (`bin/install.js:149–161`)
copies **every file verbatim**, and this spec **colocates `*.test.mjs` beside
each module** (house style, CLAUDE.md §1.7). Verbatim copy + colocated tests +
"no installer change" **cannot all hold** — the tests would ship and the
smoke check that forbids test cruft would fail. This is **resolved decisively**:
a **minimal installer change is required** — generalize `copyRecursive`'s single
`skipPath` parameter into a **skip predicate** and skip any `*.test.*` file
during the workflow copy (F11). The prior "no installer change for tests"
language is **retracted**. What remains is (i) that installer skip change, (ii) a
post-install **smoke check** that the shared modules are present/importable and
that no `*.test.*` shipped, and (iii) the contingent S2-negative
installer-codegen fallback (F2b), built only if S2 resolves negative.

**E. Is there an existing repo-layout / dependency detector to reuse? → No.**
A grep for `workspace`, `node_modules`, `hoist`, `pnpm`, `detectLayout`,
`repoLayout` across `lib/**/*.js` returns nothing. The detector is **net-new
logic** built on `git ls-files` and filesystem reads; there is no utility to
extend.

## Objectives

### Primary

-   **Resolve the two gating runtime spikes first.** Confirm S1 (does
    `isolation: 'worktree'` overlay untracked files?) and S2 (does relative
    `await import()` resolve for `_shared/*.mjs` in source **and** installed
    layouts?) before any feature implementation. These findings can materially
    collapse or reshape scope; they are the first epic and block all others.
-   **Make workflows host-delivery agnostic.** Every workflow entry point must
    read its inputs through one shared `normalizeArgs()` (delivered via dynamic
    `await import('./_shared/normalize_args.mjs')`) that accepts `args` as a
    parsed object or a JSON string, **fails loud** on anything that is not a
    valid object, and never hands a string or a defaulted `{}` to the
    destructure. **Every** `_shared` `await import(...)` must be **wrapped to
    fail loud** with a diagnostic naming the specific module and the workflow
    (F2a).
-   **Make `sprint_pipeline.js` layout-aware on the correct axis.** The pipeline
    must detect, at start, whether `node_modules` is **tracked** (survives into a
    fresh worktree) and choose `isolation: 'worktree'` versus **serial-in-tree**
    execution accordingly — with serial-in-tree as the common, safe path. In
    serial-in-tree mode stories run in a **genuine dependency-topological
    order** (net-new logic), never array order, driven by a **testable
    sequential driver** that runs exactly one story chain in flight.
-   **Prove both fixes by testing the extracted logic, not by rebuilding the
    runtime.** The risky logic (normalizer, detector, topological ordering,
    between-story tree reset, sequential driver) is extracted into small
    importable `.mjs` modules and covered by **automated unit tests**
    (`node --test`) against **real git in temp dirs**. The full
    `sprint_pipeline.js` end-to-end run (real Workflow runtime, real ≥2-story
    serial batch) is a **documented manual gate** with exact steps — not an
    automated CI harness.

### Secondary

-   **Honor DRY across all four workflows.** Extract exactly one normalizer;
    apply it uniformly via `await import()`. No per-file shims.
-   **Fail safe on ambiguity.** When layout detection cannot confidently
    classify a repo — or throws — default to the safe strategy (serial-in-tree),
    never the optimistic one (worktree), and never kill the batch.
-   **Keep the packaging contract honest.** The shared helpers ship
    automatically via the existing recursive copy; a **minimal skip-predicate
    installer change** keeps colocated `*.test.mjs` out of the payload; a smoke
    check verifies both.
-   **Preserve concurrency-safety invariants.** The serial-in-tree fallback must
    uphold `sprint_pipeline.js`'s existing single-writer-of-the-working-tree
    invariant (header comment, lines 8–21) — here by executing stories fully
    sequentially rather than by adding a lock (a lock would re-deadlock, D3/F7d).
-   **Make the operator override honest.** Add an **optional**
    `isolationStrategy?: 'auto' | 'worktree' | 'serial-in-tree'` (default
    `'auto'`) argument that existing callers can ignore, thread it through, and
    guard the `worktree`-override foot-gun with a prominent warning.

## Requirements

### Functional Requirements

#### Args normalization (Defect 1)

| # | Requirement |
|---|---|
| F1 | A single module `lib/workflows/_shared/normalize_args.mjs` MUST export `normalizeArgs(raw, workflowName)`. It MUST be the only definition of this behavior in the repo. The `.mjs` extension is mandatory (explicit ESM on **all** Node versions — no CJS-default reparse, no `MODULE_TYPELESS_PACKAGE_JSON` warning, no `Node<22.7` `SyntaxError`). |
| F1a | **Object passthrough.** A non-null, non-array object input MUST be returned by the **same reference** (no clone), preserving current behavior on hosts that already deliver an object. |
| F1b | **String parse with context.** A string input MUST be `JSON.parse`-d inside try/catch. On malformed JSON, the function MUST throw an `Error` **naming the workflow** (`workflowName`) and stating that `args` failed to parse — never a silent `undefined`. |
| F1c | **Post-parse object assertion.** After any parse, the result MUST be asserted to be a non-null, non-array object. Inputs that parse to `"[]"`, `"42"`, `'"x"'`, or `"null"` MUST **throw with context**. This closes the silent-`undefined` cascade at the destructure. |
| F1d | **No implicit default.** `null`, `undefined`, an array, or a primitive input MUST **throw with context**. There is no valid workflow invocation with no args; the function MUST NOT default to `{}`. |
| F1e | **Double-encoding.** If a parse yields another string (double-encoded JSON), the function MUST parse again and re-assert the object result, or throw. It MUST NEVER hand a string to the destructure. |
| F2 | All four workflow scripts (`review_panel.js:47`, `adversarial_verify.js:47`, `elaborate_epics.js:62`, `sprint_pipeline.js:127–138`) MUST obtain `normalizeArgs` via **dynamic** `await import('./_shared/normalize_args.mjs')` (a static `import` declaration is a likely SyntaxError in the wrapped-eval runtime — Grounding B) and destructure from `normalizeArgs(args, '<workflow-name>')` instead of from the raw `args` global. `sprint_pipeline.js` additionally obtains its layout helpers (`detect_repo_layout.mjs`, `topological_order.mjs`, `reset_worktree.mjs`, and the sequential driver) via the **same** dynamic-import mechanism. |
| F2a | **Import fail-loud + declared blast radius (ALL `_shared` modules).** **Every** `await import('./_shared/*.mjs')` site — the normalizer in all four scripts **and** each of `sprint_pipeline.js`'s layout helpers (detector, topological order, reset, sequential driver) — MUST be wrapped so an unresolvable module produces a **clear diagnostic naming the specific module and the workflow**, not a bare loader stack trace. Because each top-level `await import(...)` runs before any per-story `.catch` isolation, **any one** unresolvable `_shared` module **aborts the entire workflow invocation** (all stories, for whichever workflow). The import surface is now **×4 canonical helpers** (`normalize_args` consumed by all four scripts; `detect_repo_layout`, `topological_order`, `reset_worktree` consumed by `sprint_pipeline.js`) **plus the extracted sequential driver (×5)** — the fail-loud requirement applies to each. This blast radius is declared **ACCEPTABLE** and preferable to the status-quo silent-`undefined`, **contingent on Open Spike S2 resolving positively** (relative-specifier resolution works for `_shared/*.mjs` in both source and installed layouts). |
| F2b | **Named S2-negative fallback (ALL `_shared` modules).** If S2 resolves **negative** (relative dynamic import is unreliable in the wrapped-eval / installed layouts): first, resolve the specifier against a **runtime-provided base** if the runtime exposes one; else the **installer inlines each single canonical `_shared` module into every consuming script at copy time** (codegen from the ONE source-of-truth per module — DRY is preserved at the *source* level). Each canonical `.mjs` (normalizer, detector, topological order, reset, sequential driver) has exactly one source, and the installer inlines each into the scripts that consume it. The stated fallback is **installer-codegen-from-single-source** and it applies to **all** modules, not just the normalizer. **The fallback is contingent and currently has NO automated E-coverage** — flag it as a known risk to be closed if S2 goes negative. S2 resolution is a **hard gate**: the delivery mechanism is not finalized until S2 is decided. |
| F3 | The shared module MUST be unit-testable in **isolation** under `node --test` (it is a plain `.mjs` module; only the workflow *scripts* have the exotic runtime — Defect 1d). |

> **F4 — retired during revision (intentionally unused).** The number was
> vacated when the functional requirements were renumbered; it is left as a gap
> rather than reused so existing F-number citations stay stable.

#### Layout-aware isolation (Defect 2)

| # | Requirement |
|---|---|
| F5 | `sprint_pipeline.js` MUST run a layout-detection step **before** any story chain launches and compute a single `isolationStrategy` value used for all stories in the batch. |
| F6 | **`node_modules` tracked → worktree.** When `git ls-files node_modules` returns **non-empty** stdout (deps are committed/vendored and therefore materialize in a fresh worktree), the Implement and Verify agents MUST use `isolation: 'worktree'` — current behavior, unchanged. |
| F7 | **`node_modules` untracked/absent → serial-in-tree.** When `node_modules` is untracked (the common case), the Implement and Verify agents MUST run **serial-in-tree** (no worktree), and the pipeline MUST execute story chains **fully sequentially** (see F7a–F7d). |
| F7a | **Genuine topological ordering (net-new logic).** In serial-in-tree mode, stories MUST run **fully sequentially in dependency-topological order** computed by a **real topological sort** (Kahn's algorithm over the in-batch blockers) — **NOT array order**. Each story completes its entire impl→review→verify→merge chain before the next begins. With zero concurrency there is no shared-`HEAD` race (R1 dissolved) and no lock to deadlock against the dependency-await at line 289 (R2 dissolved). A naive "iterate the stories array in order, await each fully" serialization would **re-deadlock** when a dependent precedes its blocker in the array: the dependent awaits `terminal.get(blocker)` at `sprint_pipeline.js:289` for a story the serial loop has not started. The topological sort is therefore a **required, tested deliverable** (E3 guards it). The ordering function MUST **fail loud (throw) on a cycle** — the batch DAG is validated upstream so a cycle is can't-happen, but house style is fail-loud rather than silent misordering. |
| F7b | **Dependency-preserving between-story reset.** Between stories in serial-in-tree mode, the pipeline MUST reset the shared working tree so that tracked-file changes are reverted AND stray build artifacts (`dist/`, coverage) are removed, while **PRESERVING all installed dependencies — every `node_modules` directory, root and nested (monorepo)**. A bare `git clean -fdx` is **FORBIDDEN** in this reset: `-x` deletes gitignored files, i.e. the untracked `node_modules` that serial-in-tree exists specifically to reuse — running it would re-inflict Defect 2 every story. The prescribed reset, **in this exact order**, is: `git reset --hard` → `git checkout -f <releaseBranch>` → `git clean -fdx -e node_modules -e '**/node_modules'`. **Order matters:** `git reset --hard` runs **first** to discard any conflicting uncommitted tracked changes a failed/aborted Implement left behind; only then is `git checkout -f <releaseBranch>` safe. (The earlier `checkout`→`reset` order was wrong: `git checkout` would run first and **abort** on the exact aborted-Implement dirty tree F7b must handle; `-f` is additional belt-and-suspenders.) On the excludes: a no-slash git-clean exclude (`node_modules`) already matches at **any** depth per gitignore pathspec semantics, so `-e '**/node_modules'` is **REDUNDANT** — kept as harmless belt-and-suspenders, **not** required for nested/monorepo deps (the earlier "required for nested" justification was false). It MUST handle the case where a failed or aborted Implement left the tree dirty (R3). |
| F7c | **Worktree mode behaviorally unchanged.** Worktree mode MUST remain **behaviorally unchanged** from today (existing parallelism preserved). The source is **not** byte-identical — `isolationStrategy` is threaded through `runStory` and the Implement/Verify prompt text becomes conditional — so the correct claim is behavioral, not textual. The file now hosts **two execution models** (parallel-worktree and sequential-in-tree); they MUST NEVER be mixed within a single run — the strategy is resolved once (F5) and applies to the whole batch. |
| F7d | **Testable sequential driver (net-new, riskiest code).** Serial-in-tree execution MUST be driven by an **extracted, unit-testable** function — e.g. `runSequential(orderedStories, { runChain, resetBetween })` over injected callbacks — that: (1) consumes the topological order and runs exactly **one** story chain in flight at a time; (2) `await`s each story's full impl→review→verify→merge chain **before** starting the next; (3) runs `reset_worktree` (F7b) **between** stories — after story N's merge is captured, before story N+1's checkout — and **not** after the last story; (4) **does NOT reintroduce a lock before the dependency-await at `sprint_pipeline.js:289`.** A naive "serialize behind a lock" reading re-creates the R2 deadlock — that approach is **explicitly wrong**; correctness comes from zero concurrency plus topological order, not from a mutex. In serial-in-tree mode, `runChain` records each story's terminal outcome into the existing `terminal` map (consumed at `sprint_pipeline.js:289` via `await Promise.all(blockers.map(slug => terminal.get(slug)))`) **before** `runSequential` advances to the next story, so a dependent's `terminal.get(blocker)` at :289 is always already-resolved in topological order — no await stalls, no deadlock. E5 unit-tests this driver over injected callbacks (order equals topo order; never more than one chain in flight; `resetBetween` runs between every adjacent pair and not after the last; termination on an adverse-ordered dependency pair). |
| F8 | Detection MUST use **tracked-vs-untracked** as the axis. Test: `git ls-files node_modules` non-empty stdout → tracked → `worktree`; empty stdout → untracked → `serial-in-tree`. Hoisting is **irrelevant** and MUST NOT be part of the heuristic (a fresh worktree materializes tracked files only, so gitignored `node_modules` is absent regardless of workspace hoisting). |
| F9 | Any repo that is **not a git repo**, or where detection is inconclusive or throws, MUST default to the **safe** strategy: `serial-in-tree`. |
| F9a | **Correct exit-code handling.** `git ls-files node_modules` exits **0 with empty stdout** when nothing matching is tracked — there is **no** exit-1 "no" case. The detector MUST branch on **empty-vs-nonempty stdout** (non-empty → `worktree`, empty → `serial-in-tree`). A try/catch is reserved for the **command-error** case only — a non-git directory (`git` exit 128) or any other invocation failure — which falls back to `serial-in-tree`. A detector throw MUST NEVER kill the batch. |
| F9b | **Honest optional manual override.** `sprint_pipeline.js` MUST accept an **optional** `isolationStrategy?: 'auto' \| 'worktree' \| 'serial-in-tree'` args field (default `'auto'`). Because it is optional with an `'auto'` default, existing 10-arg callers keep working unchanged. When set to a concrete strategy it forces that strategy regardless of detection. There is **no env-var alternative** (dropped as infeasible — no workflow reads `process.env`, and it would contradict the globals-contract non-goal). If an operator forces `'worktree'` while detection finds **untracked** `node_modules`, the pipeline MUST emit a prominent `log(...)` **warning** that dependencies must already exist in the worktree or the build will fail, then **warn-and-proceed** (the operator may have provisioned deps). The override MUST be documented. |
| F9c | **SKILL.md reconciliation (holistic).** `skills/project-orchestrate/SKILL.md` MUST be updated: (a) add the optional `isolationStrategy` field to its args block (currently 10 fixed args at `SKILL.md:405–416`), and (b) **reconcile the entire now-stale paragraph at `SKILL.md:428–432`**, not just its "always run in isolated git worktrees" sentence. That paragraph is stale on **three** counts, all now mode-conditional: the "isolated git worktrees" claim (false under serial-in-tree), the `min(16, cpu_cores-2)` concurrency claim at line 430 (false under serial-in-tree, which runs one chain at a time), and the "serialized behind a lock" claim at line 432 (serial-in-tree removes the lock entirely). All three MUST be rewritten to reflect the two execution models and which holds under each. The earlier "SKILL.md contracts untouched" claim is **retracted**. This edit is a scoped task in the layout-detection epic. |
| F10 | The detection result, the evidence (`git ls-files node_modules` stdout: empty vs non-empty vs command error), and the chosen strategy MUST be surfaced via `log(...)`, including whether the value came from `auto` detection or an override. |

#### Testability of extracted logic (Defect 1 & 2)

| # | Requirement |
|---|---|
| F12 | The risky logic MUST be **extracted into small pure / near-pure functions in importable `.mjs` modules** under `lib/workflows/_shared/` so they are unit-testable against **real git in temp dirs** WITHOUT the wrapped-eval runtime: `normalizeArgs` (`normalize_args.mjs`), `detectIsolationStrategy(repoRoot)` (`detect_repo_layout.mjs`), the topological-ordering function (`topological_order.mjs`, pure), the between-story tree-reset routine (`reset_worktree.mjs`), and the sequential driver `runSequential(orderedStories, { runChain, resetBetween })` (F7d). Any extracted `_shared` module that uses ESM syntax MUST also be `.mjs`. Reconstructing/replicating the wrapped-eval Workflow runtime in a test harness is an explicit **NON-GOAL** — feasibility comes from extracting pure logic, not simulating the runtime. |

#### Packaging (Defect 1c)

| # | Requirement |
|---|---|
| F11 | The shared modules ship via the existing recursive copy at `bin/install.js:122` — **no new copy step.** Because `copyRecursive` (`bin/install.js:149–161`) currently copies every file verbatim and this spec **colocates `*.test.mjs`** beside each module (house style, CLAUDE.md §1.7), a **minimal installer change is REQUIRED**: generalize `copyRecursive`'s single `skipPath` parameter into a **skip predicate** and skip any `*.test.*` file during the workflow copy. The earlier "no installer change for tests" language is **retracted**. The existing exact-path caller at `bin/install.js:69` (`copyRecursive(sharedSrc, sharedDest, skipConfig)`) MUST be migrated to the skip-predicate form in the **same change**, so generalizing the parameter does not leave that call site broken. The post-install **smoke check** MUST assert (a) `<skills-root>/_workflows/_shared/*.mjs` helpers are present and importable, **and** (b) **no `*.test.*`** file is present in the installed payload. This installer skip change is owned by the **args-normalization-extraction** epic (the first epic to introduce a colocated test). The only OTHER contingent installer edit anywhere in this spec is the S2-negative codegen fallback (F2b), built only if S2 resolves negative. |

### Non-Functional Requirements

-   **DRY / earned abstraction (CLAUDE.md §1.4).** Exactly one `normalizeArgs`,
    one layout detector, one topological-ordering function, one tree-reset
    routine, and one sequential driver; zero duplicated shims.
-   **No new runtime dependencies.** Normalization uses only `JSON.parse`;
    detection and reset use the `git` CLI already available to the runtime — no
    packages.
-   **Performance / honest cost.** The detector runs once per pipeline
    invocation. Serial-in-tree turns N parallelizable stories into N sequential
    chains — roughly **N× wall-clock** versus the current concurrency of
    `min(16, cores − 2)`. Because the between-story reset **preserves every
    `node_modules`** (F7b), there is **no per-story reinstall** — the working
    tree's already-installed deps are reused at **zero extra install cost**. The
    cost is purely the loss of parallelism, not repeated installs. This
    regression hits the **common** repo shape (untracked `node_modules`), not an
    edge case; it is an accepted **correctness-over-speed** tradeoff and is set
    as an expectation up front.
-   **Backward compatibility.** Object-delivering hosts and tracked-`node_modules`
    repos behave exactly as today; the new `isolationStrategy` arg is optional
    (`'auto'` default), so existing callers are unaffected.
-   **Diagnosability.** Every failure mode, if it recurs, must produce a clear
    `log`/`throw` with context rather than a silent no-op — including a failed
    `await import(...)` of any `_shared` module (F2a) and a forced-`worktree`
    override on untracked deps (F9b).

### Reference implementation — `normalizeArgs`

```js
// lib/workflows/_shared/normalize_args.mjs
export function normalizeArgs(raw, workflowName) {
  const value = parseIfString(raw, workflowName)
  assertPlainObject(value, workflowName)
  return value
}

function parseIfString(raw, workflowName) {
  if (typeof raw !== 'string') return raw
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error(
      `normalizeArgs(${workflowName}): args is a string but not valid JSON.`,
      { cause },
    )
  }
  // Double-encoded: a JSON string whose payload is itself a JSON string.
  return typeof parsed === 'string' ? parseIfString(parsed, workflowName) : parsed
}

function assertPlainObject(value, workflowName) {
  const isPlainObject =
    value !== null && typeof value === 'object' && !Array.isArray(value)
  if (isPlainObject) return
  throw new Error(
    `normalizeArgs(${workflowName}): args resolved to ` +
      `${Array.isArray(value) ? 'an array' : String(value === null ? 'null' : typeof value)}; ` +
      `expected a non-null, non-array object.`,
  )
}
```

Each entry point then reads its inputs via a **fail-loud** dynamic import, e.g.
in `sprint_pipeline.js`:

```js
let normalizeArgs
try {
  ;({ normalizeArgs } = await import('./_shared/normalize_args.mjs'))
} catch (cause) {
  throw new Error(
    `sprint_pipeline: failed to load ./_shared/normalize_args.mjs ` +
      `(shared normalizer missing or unresolvable); aborting the whole invocation.`,
    { cause },
  )
}
const {
  stories,
  epicSlug,
  releaseBranch,
  // …
  situationalGuidance = [],
} = normalizeArgs(args, 'sprint_pipeline')
```

The same wrapped-import shape applies to `sprint_pipeline.js`'s layout helpers
(`detect_repo_layout.mjs`, `topological_order.mjs`, `reset_worktree.mjs`, and the
sequential driver), each with a diagnostic naming that specific module (F2a).

## Resolved Decisions

The spec **resolves** the following open decisions rather than deferring them.

### D1 — Delivery mechanism: fail-loud dynamic `await import()` for ALL `_shared` modules

The workflow scripts run in a wrapped-eval runtime (Grounding B) where a static
`import` declaration is a likely SyntaxError, but top-level `await` is confirmed
supported. `await import('./_shared/<module>.mjs')` is therefore the candidate
mechanism that is both legal in the runtime and keeps one canonical module **per
helper**. This applies uniformly to **all** `_shared` modules — the normalizer
(all four scripts) and `sprint_pipeline.js`'s detector, topological order, reset,
and sequential driver. Two properties are mandated:

-   **Every** `_shared` import MUST be **wrapped to fail loud** (F2a): an
    unresolvable module throws a diagnostic naming **that** module and the
    workflow. The blast radius is the **whole invocation** (each import precedes
    per-story `.catch` isolation) — declared acceptable and strictly better than
    the status-quo silent-`undefined`. The surface is the four canonical helpers
    plus the sequential driver.
-   The mechanism is **gated on Open Spike S2** (relative-specifier resolution
    for `_shared/*.mjs` in both source and installed layouts). The named fallback
    if S2 is negative is **installer-codegen-from-single-source** (F2b), applied
    to **every** `_shared` module: the installer inlines each one canonical
    source into its consuming scripts at copy time, preserving DRY at the source
    level. The fallback is contingent and currently has **no automated
    E-coverage** — a known risk to close if S2 goes negative. S2 must be decided
    before the mechanism is finalized.

### D2 — Detection axis: `node_modules` tracked vs untracked (NOT hoisted vs non-hoisted)

The original "hoisted vs non-hoisted" framing and its "workspaces → worktree-OK"
fast path are **wrong** and are removed. A fresh `git worktree add` materializes
**tracked files only**; gitignored `node_modules` is absent regardless of
whether a monorepo hoists to the root or a pnpm store is used. The correct,
grounded axis is:

-   **`node_modules` tracked** (`git ls-files node_modules` non-empty stdout) →
    worktree isolation is safe.
-   **`node_modules` untracked/absent** (empty stdout, the near-universal case) →
    serial-in-tree.
-   **not a git repo / command error / inconclusive** (`git` exit 128, caught) →
    serial-in-tree (safe default).

**The safe path is the common path.** Most single-package repos **and** most
monorepos (workspaces, pnpm) leave `node_modules` untracked and will select
serial-in-tree; worktree is the **rare vendored-deps** case. Any spec language
that framed worktree as the common/fast default that "works fine today" is
corrected accordingly.

### D3 — Serial-in-tree fallback: sequential topological execution, no lock, deps preserved

The earlier "extend `serializeMerge`" design was **wrong**: `serializeMerge`
(lines 238–246) wraps only the **final merge**, not the racing `git checkout`
inside the Implement (301) and Verify (317) agents; and moving any lock ahead of
the dependency-await at line 289 would **deadlock**. The correct design:

-   **R2 is dissolved by removing the shared-tree lock entirely** — not by
    placing a lock anywhere. Zero concurrency means there is no lock to deadlock
    against the dependency-await at line 289 (R2) and no shared-`HEAD` race (R1).
    The sequential driver (F7d) MUST NOT reintroduce a lock before that await; a
    "serialize behind a lock" reading is explicitly the wrong approach.
-   **Dependency order is honored by a genuine topological sort (Kahn's
    algorithm over in-batch blockers), NOT array order.** This is **net-new
    logic**. A naive array-order serialization would **re-deadlock** at
    `sprint_pipeline.js:289` when a dependent precedes its blocker in the array
    (exactly E3's adverse-order case) — the dependent awaits `terminal.get(blocker)`
    for a story the serial loop has not started. The topological sort is a
    **required, tested deliverable** (E3 guards it) and **throws on a cycle**
    (fail-loud house style, though the upstream-validated DAG makes it
    can't-happen).
-   **Between-story reset preserves dependencies** (F7b), in this **exact
    order**: `git reset --hard` → `git checkout -f <releaseBranch>` → `git clean
    -fdx -e node_modules -e '**/node_modules'`. `reset --hard` runs first so a
    dirty/aborted-Implement tree with conflicting tracked changes cannot abort
    the subsequent checkout. A bare `git clean -fdx` is forbidden — it would
    delete the untracked `node_modules` the strategy exists to reuse. The
    `-e '**/node_modules'` exclude is **redundant** (a no-slash `node_modules`
    exclude already matches at any depth per gitignore pathspec semantics) —
    kept only as harmless belt-and-suspenders, not "required for nested." A
    `git stash` is **not equivalent** (it excludes ignored files by default, so
    it neither clears `dist/` nor round-trips the same state); the earlier "or an
    equivalent stash-and-drop" claim is **removed**.
-   **Temporal coupling (order enforced):** the between-story reset runs **after**
    story N's merge is committed/captured and **before** story N+1's checkout,
    and never after the last story (F7d).
-   **Worktree mode is behaviorally unchanged** (F7c) — only the untracked path
    serializes; the two execution models are never mixed within a run.

### D4 — No per-worktree dependency provisioning

Provisioning deps per worktree (`npm ci` / `pnpm install` in each fresh
worktree) restores parallelism but reintroduces N× install cost per epic; it is
documented as a future opt-in (see Future Considerations), not built now.
Serial-in-tree reuses the working tree's already-installed deps, and — because
the between-story reset preserves every `node_modules` (F7b) — incurs **no
per-story reinstall**: cost is `~N×` wall-clock from lost parallelism alone, at
**zero extra install cost** (Non-Functional Requirements).

## Epics (linear DAG)

Work is decomposed into a **linear chain** of implementation epics — each
`depends_on` the prior — with the terminal `end-to-end-emulation-and-verification`
epic **fanning in** from all three implementation epics (args, layout, serial)
rather than from a single predecessor (see its explicit `depends_on` list).
The chain serializes every `sprint_pipeline.js` edit (no two concurrently-editable
epics touch the file, dissolving the edit-collision risk) and gives each colocated
`.test.mjs` **exactly one owner**. Slugs are kebab-case and match `spec.json`
exactly.

1.  **`runtime-behavior-spikes`** (`depends_on: []`) — the **gating** epic.
    Resolves S1 (does `isolation: 'worktree'` overlay untracked files such as
    `node_modules`?) and S2 (does relative-specifier `await import()` resolve in
    the wrapped-eval runtime for `_shared/*.mjs`, in **both** source and
    installed layouts?). **This epic BLOCKS all others; no feature
    implementation starts until both spikes are resolved.** If **S1** shows the
    runtime **overlays untracked files**, the layout detector and serial-in-tree
    work are **largely unnecessary** and downstream scope **collapses**:
    specifically F5/F6/F7/F7a/F7b/F7c/F7d/F8/F9/F9a/F9b/F9c/F10 become **no-ops
    or vestigial**, the `repo-layout-detection` and `serial-in-tree-execution`
    epics shrink to near-empty (detector, topological order, reset, and driver
    are not built), and only the args-normalization work and its verification
    remain. If **S2** resolves negative, the delivery mechanism switches to the
    F2b installer-codegen fallback before any entry point is wired. Encoded with
    `epic_type: "design-spike"`; the plan carries top-level `design_spike: true`.
2.  **`args-normalization-extraction`** (`depends_on: [runtime-behavior-spikes]`)
    — the `normalize_args.mjs` module, its colocated `.test.mjs` (E1, owned
    here), and wiring **all four** workflows through a fail-loud `await import()`.
    Edits `sprint_pipeline.js`'s args read (127–138). **Owns the F11 installer
    skip-predicate change** (this is the first epic to introduce a colocated
    test, so the `*.test.*` skip must land here) and the post-install smoke
    check.
3.  **`repo-layout-detection`** (`depends_on: [args-normalization-extraction]`) —
    `detect_repo_layout.mjs` and its colocated `.test.mjs` (E2, owned here); the
    optional `isolationStrategy` override; strategy resolution wiring **after**
    the empty-batch guard (140–143); and the F9c SKILL.md reconciliation. Edits
    `sprint_pipeline.js`.
4.  **`serial-in-tree-execution`** (`depends_on: [repo-layout-detection]`) —
    `topological_order.mjs` + test (E3), `reset_worktree.mjs` + test (E4), and
    the extracted sequential driver module + test (E5, F7d), all owned here; the
    conditional Implement/Verify prompt text (179/200); and the
    two-execution-model restructure of `runStory`/the story loop (286–360). Edits
    `sprint_pipeline.js`.
5.  **`end-to-end-emulation-and-verification`**
    (`depends_on: [args-normalization-extraction, repo-layout-detection,
    serial-in-tree-execution]`) — owns the **integration gate wiring** and the
    **documented MANUAL gate M1 ONLY**. It does **NOT** re-author the per-module
    unit tests (E1–E5 belong to each module's epic).

**Test ownership** is explicit and single-owner: **E1** (normalizer) →
args-normalization-extraction; **E2** (detector) → repo-layout-detection; **E3**
(topological order) + **E4** (reset) + **E5** (sequential driver) →
serial-in-tree-execution; **integration + M1** → end-to-end-emulation-and-verification.

## Non-Goals

-   **The removed-shim cruft observed in the `stolarch` working tree is out of
    scope and requires no change here.** That was a **local, uncommitted
    regression** in `stolarch`'s working tree — not present in *this* repo's
    committed source. There is nothing in `claudescrumskill` to fix for it, and
    this spec does not re-litigate it. (Called out explicitly so a later reader
    does not "rediscover" a phantom defect.)
-   **`github`-mode cross-story dependency chaining is pre-existing and NOT
    regressed by serial-in-tree.** In `github` backend mode a dependent story
    branches from `releaseBranch`, which may lack a blocker's still-unmerged PR
    commits — a chaining gap that already exists today. Serial-in-tree does not
    introduce or worsen it (if anything, sequential merge-before-next-checkout
    reduces the window), so it MUST NOT be rediscovered as a new defect of this
    change; it is out of scope here.
-   **No refactor of the Workflow globals contract**
    (`args`/`log`/`phase`/`agent`/`parallel`). A runtime-injected normalizer is
    explicitly **out of scope** — that is precisely why the fix uses
    `await import()` of a shipped module rather than expecting the runtime to
    provide one, and why the env-var override is dropped (no workflow reads
    `process.env`). This spec adapts to the contract; it does not redesign it.
-   **Reconstructing / replicating the wrapped-eval Workflow runtime in a test
    harness is a non-goal.** Verification feasibility comes from **extracting
    pure logic** into importable `.mjs` modules (F12) and unit-testing it against
    real git, plus one documented manual end-to-end run — not from simulating the
    runtime in CI.
-   **Per-worktree dependency provisioning (D4) is not built** in this change; it
    is captured only as a future opt-in.
-   **No new installer *copy step*.** The recursive copy at `bin/install.js:122`
    already ships `_shared/` (Grounding D). The **only** installer edits are the
    F11 `*.test.*` skip predicate (required, to keep tests out of the payload)
    and the contingent S2-negative codegen fallback (F2b).
-   **No change to the other three workflows' logic** beyond routing their `args`
    read through `normalizeArgs` via `await import()`.

## Assumptions & Open Spikes

Both spikes below **gate implementation and are the first epic**
(`runtime-behavior-spikes`, on which every other epic `depends_on`). Each
**gates** a design decision and can materially change scope. They are first-class
acceptance items, not footnotes, and the gating is enforced by the epic
dependency edges, not narrative alone.

-   **S1 — Worktree behavior with untracked files (gates Defect 2, esp. §2b).**
    Confirm what **this** Workflow runtime's `isolation: 'worktree'` actually
    does with untracked files:
    -   If it performs a plain `git worktree add` (tracked files only), the
        detector is needed exactly as specified and serial-in-tree is required
        for untracked-`node_modules` repos.
    -   If it **copies/overlays the live working tree** (untracked files
        included, e.g. `node_modules`), Defect 2 **largely evaporates**. In that
        case the following become **no-ops / are not built**: the detector
        (`detect_repo_layout.mjs`, F8/F9/F9a/F10), the serial-in-tree strategy
        and its topological order/reset/driver (F7/F7a/F7b/F7c/F7d), the optional
        override and SKILL.md reconciliation (F9b/F9c), and E2–E5. The
        `repo-layout-detection` and `serial-in-tree-execution` epics collapse to
        near-empty; only args normalization (F1–F3, E1) and its verification
        remain.
    This is a **gating acceptance item**: implementation of the detector does not
    start until S1 is resolved.
-   **S2 — Dynamic-import relative-path resolution for ALL `_shared` modules
    (gates Defect 1 mechanism).** Confirm that
    `await import('./_shared/<module>.mjs')` resolves the relative specifier
    correctly in the wrapped-eval runtime, for **every** `_shared/*.mjs`
    (normalizer, detector, topological order, reset, sequential driver), in
    **both** the source tree and the installed `<skills-root>/_workflows/`
    layout. This is a **hard gate** on the delivery mechanism (D1/F2a/F2b). If
    relative resolution is unreliable, resolve against a runtime-provided base if
    one exists; else adopt the **installer-codegen-from-single-source** fallback
    (F2b) for **all** modules before wiring any entry point. The fallback
    currently has **no automated E-coverage** — a known risk to close if S2 goes
    negative.

## Technical Specifications

-   **Language/Framework**: Node.js modules executed by the Claude Code Workflow
    tool in a wrapped-eval context (top-level `export`, `return`, and `await`
    coexist — Grounding B). Delivery of shared code is via a **fail-loud** dynamic
    `await import()`, not static `import` declarations. Shared modules are `.mjs`
    (explicit ESM on all Node versions).
-   **Dependencies**: `JSON.parse` for normalization; the `git` CLI (already
    available) for detection and the between-story reset. No new packages.
-   **Key Components**:
    -   New `lib/workflows/_shared/normalize_args.mjs` exporting `normalizeArgs`
        (reference implementation above), imported by all four entry points via a
        wrapped `await import()`.
    -   New `lib/workflows/_shared/detect_repo_layout.mjs` exporting
        `detectIsolationStrategy(repoRoot)` → `'worktree' | 'serial-in-tree'`,
        using `git ls-files node_modules` with empty-vs-nonempty stdout branching
        and try/catch for the command-error case (F8, F9, F9a).
    -   New `lib/workflows/_shared/topological_order.mjs` exporting a pure
        topological-ordering function (Kahn's algorithm over in-batch blockers,
        throws on a cycle) consumed by serial-in-tree execution (F7a).
    -   New `lib/workflows/_shared/reset_worktree.mjs` exporting the
        dependency-preserving between-story reset routine (F7b), in the order
        `git reset --hard` → `git checkout -f <releaseBranch>` → `git clean -fdx
        -e node_modules -e '**/node_modules'`.
    -   New `lib/workflows/_shared/` sequential driver exporting
        `runSequential(orderedStories, { runChain, resetBetween })` (F7d), the
        extracted, unit-testable serial executor.
    -   Edits to all four workflow scripts to fail-loud `await import()` and apply
        `normalizeArgs`.
    -   Edits to `sprint_pipeline.js` to compute and consume `isolationStrategy`
        (including the optional `'auto' | 'worktree' | 'serial-in-tree'` override,
        F9b) and to add sequential topological execution + dependency-preserving
        between-story tree reset for serial-in-tree via the driver.
    -   Minimal `bin/install.js` change: generalize `copyRecursive`'s `skipPath`
        into a skip predicate that filters `*.test.*` from the workflow copy
        (F11).
    -   Edit to `skills/project-orchestrate/SKILL.md` (F9c): add the optional
        `isolationStrategy` arg and holistically reconcile the stale
        worktrees/`min(16, cpu_cores-2)`/"serialized behind a lock" paragraph at
        `SKILL.md:428–432`.
-   **Data Structures**:
    -   `normalizeArgs(raw: object | string, workflowName: string): object`.
    -   `IsolationStrategy = 'worktree' | 'serial-in-tree'`.
    -   Override input: `isolationStrategy?: 'auto' | 'worktree' | 'serial-in-tree'`
        (default `'auto'`). The token is exactly `'serial-in-tree'` everywhere —
        no `'serial'` short form. No env var.
    -   Detection evidence (internal): the outcome of `git ls-files node_modules`
        (non-empty stdout vs empty stdout vs command error / exit-128).
    -   `runSequential(orderedStories, { runChain, resetBetween })`: injected
        callbacks; runs one chain in flight, `resetBetween` between adjacent
        pairs only.
-   **APIs/Interfaces**: The Workflow-tool globals contract
    (`args`, `log`, `phase`, `agent`, `parallel`) is consumed unchanged; the
    `agent(...)` option `isolation` is set to the resolved strategy at
    `sprint_pipeline.js` lines 301 (Implement) and 317 (Verify).

## Architecture

-   **Normalization seam.** Each workflow's first act becomes a **wrapped**
    `const { normalizeArgs } = await import('./_shared/normalize_args.mjs')`
    (fail-loud on load, F2a) followed by `const { … } = normalizeArgs(args,
    '<name>')` instead of `const { … } = args`. The helper is the single
    authoritative representation of the string-or-object contract and the
    fail-loud assertions. `sprint_pipeline.js` loads its layout helpers through
    the same wrapped-import shape (F2a), each with a module-specific diagnostic.
-   **Detection seam in `sprint_pipeline.js`.** Immediately after inputs are
    normalized and the empty-batch guard (currently lines 140–143), the pipeline
    resolves `isolationStrategy` — honoring the optional `'auto' | 'worktree' |
    'serial-in-tree'` override (warning on a forced-`worktree`-over-untracked-deps
    foot-gun, F9b), else calling `detectIsolationStrategy(repoRoot)` once — logs
    the outcome and evidence (F10), and stores it. `runStory` (currently lines
    286–332) reads that single value when building the Implement (301) and Verify
    (317) agent options.
-   **Serial-in-tree wiring.** When the strategy is `serial-in-tree`, the
    pipeline stops mapping stories concurrently and instead drives them through
    `runSequential` (F7d) in **genuine dependency-topological order** (Kahn's
    sort, F7a), awaiting each story's full chain and resetting the shared tree
    between stories with the dependency-preserving reset (F7b) **after** story
    N's merge is captured and **before** story N+1's checkout (never after the
    last). The Implement and Verify `agent(...)` calls omit `isolation:
    'worktree'` and run against the shared tree. No lock is introduced before the
    dependency-await at line 289. When the strategy is `worktree`, behavior is
    behaviorally unchanged from today (F7c). The two execution models are never
    mixed within a run.
-   **Prompt reconciliation.** The Implement/Verify prompt text currently asserts
    "You are in an isolated git worktree" (lines 179, 200). Under serial-in-tree
    these instructions MUST be made conditional so the agent is told its actual
    execution mode, not a false one — otherwise the agent acts on a wrong premise
    about branch safety.
-   **Detector escape hatch.** The detector is wrapped in try/catch (F9a) and the
    optional operator override (F9b) sits in front of it, so a wrong
    auto-classification in either direction is recoverable — for `serial-in-tree`
    silently, for a forced `worktree` with a loud warning.
-   **System boundary.** The workflow logic changes live in `lib/workflows/`. The
    `skills/project-orchestrate/SKILL.md` contract **is** updated (F9c: optional
    `isolationStrategy` arg + holistic reconciliation of the stale worktrees/
    concurrency/lock paragraph) — the earlier "SKILL.md untouched" claim is
    retracted. The JSON schemas are untouched. `bin/install.js` takes **one**
    minimal edit (the F11 `*.test.*` skip predicate); the only other contingent
    installer work is the S2-negative codegen fallback (F2b).

## Implementation Plan

Ordered checklist mapped to the epic DAG. **Steps 0a/0b are the gating
`runtime-behavior-spikes` epic** — later steps depend on their findings and do
not start until both resolve.

0a. **Resolve Open Spike S1** (worktree + untracked files). If the runtime
    overlays untracked files, collapse the layout/serial scope per S1 above
    before building anything downstream.
0b. **Resolve Open Spike S2** (dynamic-import relative-path resolution for all
    `_shared/*.mjs`) in both source and installed layouts; pick the specifier
    form — or adopt the F2b installer-codegen fallback for all modules — before
    wiring.

*(args-normalization-extraction)*
1.  **Create the shared normalizer.** Add `lib/workflows/_shared/normalize_args.mjs`
    per the reference implementation (F1–F1e). Colocate a `.test.mjs` (E1).
2.  **Unit-test the normalizer** under `node --test` (F3, E1), covering: object
    passthrough (same reference), JSON-string-of-object, `"[]"`, `"42"`, `null`,
    `undefined`, malformed string, double-encoded.
3.  **Wire the normalizer into all four workflows (F2, F2a)** via a **fail-loud**
    `await import('./_shared/normalize_args.mjs')` and `= normalizeArgs(args,
    '<name>')` at `review_panel.js:47`, `adversarial_verify.js:47`,
    `elaborate_epics.js:62`, `sprint_pipeline.js:127–138`. No other logic changes.
4.  **Installer skip predicate + smoke check (F11).** Generalize
    `copyRecursive`'s `skipPath` into a skip predicate filtering `*.test.*`;
    install into a scratch skills dir; assert `_shared/*.mjs` present/importable
    and no `*.test.*` shipped.

*(repo-layout-detection)*
5.  **Extract + create the layout detector.** Add
    `lib/workflows/_shared/detect_repo_layout.mjs` implementing the
    tracked-vs-untracked axis via `git ls-files node_modules`, branching on
    empty-vs-nonempty stdout with try/catch for the command-error case (F8, F9,
    F9a). Colocate a `.test.mjs` per branch (E2).
6.  **Resolve strategy once in `sprint_pipeline.js` (F5, F9b, F10).** After the
    empty-batch guard, apply the optional `isolationStrategy` override (with the
    forced-`worktree` foot-gun warning) or call the detector, `log` the strategy +
    evidence + source (auto/override), store it.
7.  **Update `skills/project-orchestrate/SKILL.md` (F9c).** Add the optional
    `isolationStrategy` arg to the args block (405–416); holistically reconcile
    the stale worktrees/`min(16, cpu_cores-2)`/lock paragraph (428–432).

*(serial-in-tree-execution)*
8.  **Extract the topological-ordering function.** Add
    `lib/workflows/_shared/topological_order.mjs` (Kahn's algorithm over in-batch
    blockers, throws on a cycle, F7a) as a pure module. Colocate a `.test.mjs`
    including the adverse-order case (E3).
9.  **Extract the between-story reset routine.** Add
    `lib/workflows/_shared/reset_worktree.mjs` implementing the
    dependency-preserving reset in the corrected order (F7b). Colocate a
    `.test.mjs` asserting `node_modules` (root + nested) survives and `dist/` is
    cleared after a genuinely conflicting dirty tree (E4).
10. **Extract the sequential driver.** Add the `runSequential(orderedStories, {
    runChain, resetBetween })` module (F7d). Colocate a `.test.mjs` (E5)
    asserting order, single-in-flight, between-pair reset, and termination.
11. **Consume the strategy (F6, F7).** In `worktree` mode, unchanged. In
    `serial-in-tree` mode, drive stories through `runSequential` in topological
    order (F7a), reset between stories (F7b), omit `isolation: 'worktree'` at
    301/317, and make the Implement/Verify prompt language conditional (179, 200).

*(end-to-end-emulation-and-verification)*
12. **Integration gate + manual gate (M1).** Wire the integration gate and
    execute/record the documented manual end-to-end run (see Testing Strategy).

## Testing Strategy

### Unit tests (automated, `node --test`, against real git in temp dirs)

Each unit test is **owned by its module's epic** (single owner). The emulation
epic owns integration + M1 only; it does **not** re-author these.

-   **`normalizeArgs`** (E1, args epic): object passthrough returns the **same
    reference**; JSON-string-of-object parses; and each of `"[]"`, `"42"`,
    `null`, `undefined`, malformed string throws **with context**; double-encoded
    resolves to the object or throws — never returns a string.
-   **`detectIsolationStrategy`** (E2, detection epic): `worktree` when `git
    ls-files node_modules` has non-empty stdout; `serial-in-tree` when empty;
    `serial-in-tree` on non-git / exit-128 / thrown detector (F8, F9, F9a) —
    exercised against **real temp repos**.
-   **`topological_order`** (E3, execution epic): correct dependency order for a
    normal batch and for the **adverse-order** case (a dependent listed before
    its blocker); throws on a cycle.
-   **`reset_worktree`** (E4, execution epic): against a **real temp repo**, dirty
    a **tracked** file whose content **differs between the story branch and
    `releaseBranch`** (so a plain checkout would genuinely conflict), then assert
    the reset returns a **clean tree**, every `node_modules` (root + nested)
    **survives**, and `dist/` / coverage are **cleared** — a non-conflicting
    dirty is insufficient.
-   **`runSequential`** (E5, execution epic): over injected callbacks, assert
    (a) execution order equals the topological order, (b) never more than one
    chain in flight, (c) `resetBetween` runs between every adjacent pair and not
    after the last, (d) it terminates (no deadlock) on an adverse-ordered
    dependency pair.

### Verification phase — automated units + one documented manual gate

> **The fix is not done until this passes.** The automated units above run
> directly under `node --test` against real git; the full end-to-end run is a
> **documented manual gate**. Reconstructing the wrapped-eval runtime in a CI
> harness is a non-goal (F12).

-   **E1 — `normalizeArgs` fail-loud matrix** (automated `node --test`): feed
    `object`, JSON-string-of-object, `"[]"`, `"42"`, `null`, malformed string, and
    double-encoded; assert the good shapes pass through and every bad shape
    **throws with context**.
-   **E2 — `detectIsolationStrategy` branches** (automated `node --test` against
    real temp repos): tracked `node_modules` → `worktree`; untracked →
    `serial-in-tree`; non-git / command-error → `serial-in-tree` (never throws to
    the caller).
-   **E3 — topological ordering incl. adverse order** (automated `node --test`,
    pure function): a dependency pair where the batch/array order is adverse (A
    depends on B, but B is ordered first) resolves to dependency order; guards
    against the array-order re-deadlock at `sprint_pipeline.js:289`; throws on a
    cycle.
-   **E4 — between-story reset preserves deps, clears artifacts** (automated
    `node --test` against a real temp repo): after the reset — with a genuinely
    conflicting dirtied tracked file — `node_modules` (root **and** nested)
    **survives**, the tree is **clean**, and `dist/` / coverage are cleared.
-   **E5 — sequential driver** (automated `node --test`, injected callbacks):
    order equals topological order; never more than one chain in flight;
    `resetBetween` between every adjacent pair and not after the last; termination
    on an adverse-ordered dependency pair. **E5 converts the concurrency-safety
    guarantee from manual-only (M1) to automated**, directly mitigating the risk
    that M1 is skipped.
-   **M1 — Full `sprint_pipeline.js` end-to-end (DOCUMENTED MANUAL gate).** Run
    the real workflow against the **real Workflow runtime** with a real **≥2-story
    serial batch** — including two independent stories (surfaces a shared-`HEAD`
    race if serialization is wrong), an adverse dependency pair (surfaces a
    deadlock if topo-sort is wrong), a dirty-tree carryover (proves F7b reset), a
    forced `isolationStrategy` override in both directions, and a simulated
    detector throw that must **not** kill the batch. The **exact steps** MUST be
    recorded so the gate is reproducible. This is **not** an automated CI harness.

**Gate:** E1–E5 must pass automatically, and M1 must be executed and recorded. If
any fails, the change is not shippable regardless of unit green. Because E5
automates the single-in-flight/ordering/termination guarantees, M1's role narrows
to whole-runtime confirmation rather than sole proof of concurrency safety.

**Honest scope of E5 (stated tradeoff, not a new requirement).** E5 automates the
**driver's** ordering / single-in-flight / termination guarantees in isolation, but
the **integration** of that driver into `sprint_pipeline.js` — correct `await
import()` specifiers, no mixed execution models, the conditional Implement/Verify
prompt text, and the `runSequential`↔`terminal`-map wiring — is verified **only**
by the manual M1 gate. Stated plainly: **E1–E5 green ≠ integration proven;
integration safety rests on M1.**

## Future Considerations

-   **Opt-in per-worktree provisioning (D4).** For very large untracked-deps
    batches where serial execution is the bottleneck, add an explicit opt-in that
    provisions dependencies per worktree (`npm ci` / `pnpm install`) to restore
    parallelism. Deliberately deferred to avoid the N× install cost by default.
-   **Extending normalization to future workflows.** Any new script under
    `lib/workflows/` must route its `args` read through `normalizeArgs` via a
    fail-loud `await import()` — worth a line in the workflow-authoring guidance
    so the DRY contract does not erode.
-   **Automated coverage for the F2b codegen fallback.** If S2 resolves negative
    and the installer-codegen path is built, add automated coverage for the
    inlining so the fallback is not shipped untested.
-   **Richer layout signals.** If a future runtime materializes untracked files
    into worktrees (Spike S1 outcome), revisit the detector — it may become a
    no-op. The tracked-vs-untracked check is the single place to evolve; the
    safe default (serial-in-tree) means an unknown case degrades to correct, just
    slower.
