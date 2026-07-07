# CONTEXT — args-normalization-extraction

> Design anchor produced by the `runtime-behavior-spikes` design-spike epic.
> Binding for this epic; overrides generic CLAUDE.md conventions where they
> conflict. See `docs/adrs/0006-workflow-execution-robustness.md` and
> `docs/specs/20260706_235230_workflow_execution_robustness.md`.

## Runtime reality (from spikes S1/S2 — read first)

Workflow scripts run in a wrapped-eval runtime with **no `import()`, no
`require`, no `process`/`child_process`** (only globals `log, phase, console,
budget, setTimeout, clearTimeout, Date, agent, parallel, pipeline, workflow,
args`). Shared logic therefore CANNOT be imported at runtime — it is **inlined**
into each script from a single canonical `.mjs` source, guarded by a drift test.
There is no `await import()` and thus no import-failure blast radius / fail-loud
import wrapper (spec F2a is moot); fail-loud lives inside `normalizeArgs`.

## Naming & file layout

- Canonical module: `lib/workflows/_shared/normalize_args.mjs` (explicit ESM,
  `.mjs` mandatory). Exports `normalizeArgs(raw, workflowName)`.
- Colocated test: `lib/workflows/_shared/normalize_args.test.mjs` (E1).
- Drift/inline-sync helper + test: `lib/workflows/_shared/inline_sync.mjs` +
  `inline_sync.test.mjs`.

## Inlining pattern (every consuming script)

Each workflow script carries a delimited block:

```
// >>> BEGIN inlined from _shared/normalize_args.mjs — DRY source of truth; regenerate, do not hand-edit >>>
function normalizeArgs(raw, workflowName) { ... }
function parseIfString(...) { ... }
function assertPlainObject(...) { ... }
// <<< END inlined from _shared/normalize_args.mjs <<<
```

The block equals `stripExports(normalize_args.mjs)` (export keywords removed).
`inline_sync.test.mjs` asserts this equality for every script/module pair.

## `normalizeArgs` contract (F1–F1e)

1. Non-null non-array object → returned by **same reference** (no clone).
2. String → `JSON.parse` in try/catch; malformed → throw `Error` naming the
   workflow, with `{ cause }`.
3. After any parse, assert non-null non-array object; `"[]"`, `"42"`, `'"x"'`,
   `"null"` → throw with context.
4. `null`/`undefined`/array/primitive → throw with context (no implicit `{}`).
5. Double-encoded (parse yields a string) → parse again + re-assert.

## Wiring (F2)

All four scripts read inputs via `normalizeArgs(args, '<name>')`:
`review_panel.js`, `adversarial_verify.js`, `elaborate_epics.js`,
`sprint_pipeline.js`. Replace `const { ... } = args` with the inlined function +
`const { ... } = normalizeArgs(args, '<name>')`.

## Installer (F11 — owned here)

`bin/install.js` `copyRecursive(src, dest, skipPath)` → generalize `skipPath`
into a **skip predicate** `(absPath) => boolean`; filter `*.test.*` during the
workflow copy. Migrate the existing exact-path caller at the shared-references
copy in the **same change**. Add a post-install smoke check: `_shared/*.mjs`
present/importable AND no `*.test.*` shipped.
