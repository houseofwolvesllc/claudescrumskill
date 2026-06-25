# Preserve & Merge User Config on Install — Non-Destructive `config.json` Upgrades

> **Document type: Engineering task spec.** Single-deliverable change to the
> npm `postinstall` installer (`bin/install.js`). Not a multi-epic product
> build. The "Implementation Plan" is an ordered edit + test checklist, not a
> sprint breakdown. The valuable artifact here is the **acceptance criteria** —
> they are the test matrix the change must satisfy before it ships.

## Overview

The npm `postinstall` hook (`bin/install.js`) installs the scrum skills by
recursively copying the package's `skills/` tree into the install target
(`~/.claude/skills/` for global installs, `<project>/.claude/skills/` for local).
The copy is performed by `copyRecursive`, which calls `fs.copyFileSync`
**unconditionally**. This is correct for product files — skill markdown,
`shared/references/`, `shared/templates/`, and `lib/workflows/` *should* be
replaced on every upgrade. It is **wrong for exactly one file**:
`skills/shared/config.json`.

`config.json` is user-owned configuration: it holds `scaffolding` mode, output
`paths` (specs/adr/backlog/context), `scaffold` thresholds, and integration keys
(`jira.project_key`, `trello.board_id`). Today, every `npm install`/upgrade
silently overwrites it with the shipped defaults — destroying whatever the user
configured. This is a data-loss bug.

> **This is not hypothetical.** The installed config in this very repo
> (`.claude/skills/shared/config.json`) has already diverged from the shipped
> default: its `paths.specs` is `docs/specs` (and `paths.adr` is `docs/adrs`),
> whereas the package default (`skills/shared/config.json`) ships
> `.claude-scrum-skill/specs`. A re-run of the current installer would silently
> revert that customization. The bug is live.

This spec implements **Option B (deep-merge)**: on upgrade, the installer
deep-merges the shipped default config with the user's existing config, with
**user values winning**. New default keys introduced by an upgrade flow in;
existing user values are preserved. Fresh installs are byte-for-byte identical
to today's behavior (default copied verbatim). Malformed user config is backed
up rather than discarded.

## Objectives

### Primary

-   **Stop destroying user configuration on upgrade.** A re-install/upgrade must
    never silently overwrite a populated `config.json` with defaults.
-   **Deliver new default keys on upgrade.** Keys added to the shipped default in
    a future version must appear in the user's merged config after upgrade,
    without the user editing anything.
-   **Preserve fresh-install behavior exactly.** When no user config exists at the
    target, the default is copied verbatim — no behavior change, no observable
    difference from today.

### Secondary

-   **Never silently discard a malformed user config.** If the existing
    `config.json` is not valid JSON, back it up to `config.json.bak` before
    writing a fresh default, and warn the user.
-   **Make installer behavior visible.** Emit distinct, accurate log lines for the
    "merged existing config" path versus the "wrote default config" path.
-   **Make the merge logic unit-testable** by extracting it into pure, exported
    functions that can run without triggering the installer's filesystem
    side-effects.

## Requirements

### Functional Requirements

| # | Requirement |
|---|-------------|
| F1 | `config.json` MUST be excluded from the generic `copyRecursive` traversal of the `shared/` directory so it is never blindly overwritten. |
| F2 | A dedicated config installer MUST run for `skills/shared/config.json` with three branches: (a) target missing, (b) target present + valid JSON, (c) target present + invalid JSON. |
| F3 | **Branch (a) — fresh install:** copy the shipped default verbatim to the target. Behavior identical to today. |
| F4 | **Branch (b) — upgrade:** deep-merge the shipped default into the user's existing config with **user scalar/array values winning**, then write the merged result. |
| F5 | **Branch (c) — malformed user config:** rename/copy the existing file to `config.json.bak` (same directory), then write the shipped default. The user's original bytes MUST survive in the `.bak` file. |
| F6 | Deep-merge MUST recurse into nested plain objects (e.g. `paths`, `scaffold`, `jira`, `trello`). For any leaf key present in **both** default and user config, the **user's value wins**. For keys present only in the default, the default value is added. |
| F7 | **Orphan keys** — keys present in the user config but absent from the shipped default — MUST be left in place (not pruned). |
| F8 | Arrays MUST be treated as leaf values, not merged element-wise: if the user config has an array at a key, the user's array wins wholesale; otherwise the default array is used. (The current schema has no arrays; this rule is forward-looking and prevents accidental concatenation.) |
| F9 | All other files in the install tree — every skill directory, `shared/references/`, `shared/templates/`, the `shared/` tree minus `config.json`, and `lib/workflows/` → `_workflows/` — MUST continue to be overwritten unconditionally. Only `config.json` is treated as user-owned. |
| F10 | The installer MUST log distinct messages for the merge path vs. the default-write path vs. the malformed-backup path, so the chosen behavior is observable in the install output. |
| F11 | The merged file MUST be written as human-readable JSON (2-space indent, trailing newline) consistent with the shipped default's formatting, so a user can hand-edit it afterward. |

### Non-Functional Requirements

-   **Zero new runtime dependencies.** The installer runs in npm's `postinstall`
    sandbox and must rely only on Node's built-ins (`fs`, `path`). No JSON-merge
    libraries.
-   **Idempotent.** Running the installer twice in a row over an
    already-merged config MUST produce a byte-identical file the second time
    (no drift, no duplicated keys, no reordering churn).
-   **Crash-safe for the install as a whole.** A failure in config handling MUST
    NOT abort the rest of the skill installation. Config errors are caught,
    logged, and the installer continues (the skills are the critical payload).
-   **Cross-platform.** Must work on macOS, Linux, and Windows (`fs`/`path`
    only; no shell-outs).
-   **Testable without side-effects.** The pure merge logic must be importable and
    exercised by unit tests that touch no real install directory.

## Technical Specifications

-   **Language/Framework**: Node.js, CommonJS (matches existing `bin/install.js`
    and `lib/workflows/*.js`).
-   **Dependencies**: None added. `fs` + `path` only. Tests use the built-in
    `node:test` + `node:assert` (no devDependency, no runner install).
-   **Key Components**:
    -   `deepMerge(defaults, overrides)` — pure function. Returns a new object;
        recurses plain objects, treats arrays/scalars as leaves with `overrides`
        winning. No mutation of either input.
    -   `installConfig(defaultPath, destPath)` — orchestrates the three-branch
        logic (missing / valid / malformed), performs the reads, the backup, the
        merge, and the write. Returns a small result descriptor
        (e.g. `{ action: 'default' | 'merged' | 'recovered' }`) for logging and
        testing.
    -   Wiring in the main install flow: exclude `config.json` from the `shared/`
        recursive copy; invoke `installConfig` explicitly after the `shared/`
        copy.
-   **Data Structures**: The config is a shallow tree of plain objects with scalar
    leaves (current shape: `scaffolding` string, `paths` object of strings,
    `scaffold` object of number/bool, `jira`/`trello` objects of strings).
-   **APIs/Interfaces**: `bin/install.js` must export `{ deepMerge, installConfig }`
    (CJS `module.exports`) **without executing the install on import**, so unit
    tests can require it. This requires guarding the top-level install execution
    behind a `require.main === module` check (run only when invoked directly as
    the postinstall entrypoint).

### `config.json` excerpt (the data being protected)

```json
{
  "scaffolding": "local",
  "paths": {
    "specs": ".claude-scrum-skill/specs",
    "adr": ".claude-scrum-skill/adr",
    "backlog": ".claude-scrum-skill/backlog",
    "context": ".claude-scrum-skill/context"
  },
  "scaffold": { "two_pass_threshold_words": 5000, "design_spike_enabled": true },
  "jira": { "project_key": "" },
  "trello": { "board_id": "" }
}
```

## User Experience

The installer is a CLI side-effect of `npm install`. The user-facing surface is
the console output. Expected lines per scenario:

| Scenario | Log line (illustrative) |
|----------|--------------------------|
| Fresh install (no existing config) | `  📁 config (default)` |
| Upgrade over existing valid config | `  🔧 config (merged — your settings preserved)` |
| Upgrade over malformed config | `  ⚠️  config was invalid JSON — backed up to config.json.bak, wrote default` |

No interactive prompts. No new flags. The change is invisible to fresh installs
and protective for upgrades.

## Architecture

```
postinstall → node bin/install.js  (only when require.main === module)
  │
  ├─ copyRecursive(shared/, dest)   ── EXCLUDES config.json  (F1)
  ├─ for each skill: copyRecursive  ── unchanged, unconditional overwrite (F9)
  ├─ copyRecursive(lib/workflows/, _workflows/) ── unchanged (F9)
  └─ installConfig(defaultConfigPath, destConfigPath)   ── NEW (F2–F8, F10–F11)
        ├─ dest missing      → write default verbatim        → action: 'default'
        ├─ dest valid JSON   → deepMerge(default, user) write → action: 'merged'
        └─ dest invalid JSON → copy dest→.bak, write default  → action: 'recovered'
```

-   **Data flow**: shipped default (`skills/shared/config.json` in the package) is
    the source of *new* keys; the user's installed file is the source of *truth*
    for existing values. Merge output is written back to the installed path only.
-   **System boundary**: `installConfig` is the sole writer of the installed
    `config.json`. The generic `copyRecursive` must never touch that path.
-   **Integration point**: `config.json`'s `paths.specs` is read by `/project-spec`
    and the other skills — preserving it is what keeps a user's customized output
    locations stable across upgrades.

## Implementation Plan

1.  **Guard the entrypoint.** Wrap the top-level install execution in
    `if (require.main === module) { ... }` (or extract it into a `main()` invoked
    under that guard) so importing the module has no side-effects. (Enables F-API.)
2.  **Add `deepMerge(defaults, overrides)`** as a pure, documented function.
    Recurse plain objects; treat arrays and scalars as leaves with `overrides`
    winning; never mutate inputs; preserve orphan keys from `overrides`. (F6–F8)
3.  **Add `installConfig(defaultPath, destPath)`** implementing the three-branch
    logic, returning `{ action }`. Reads default, branches on dest
    existence/validity, performs backup/merge/write, writes 2-space-indented JSON
    with trailing newline. (F2–F5, F11)
4.  **Exclude `config.json` from the `shared/` copy.** Either filter it inside the
    `shared/` traversal or copy `shared/` then let `installConfig` own the file.
    Verify no code path lets `copyRecursive` write it. (F1)
5.  **Wire `installConfig` into the main flow** after the `shared/` copy and emit
    the distinct log lines based on the returned `action`. Wrap in try/catch so a
    config failure logs and continues the rest of the install. (F10, NFR crash-safety)
6.  **Export** `{ deepMerge, installConfig }` via `module.exports`. (F-API)
7.  **Add `test/install.test.js`** using `node:test` + `node:assert`; add a
    `"test": "node --test"` script to `package.json`. (See Testing Strategy.)
8.  **Manual smoke test:** simulate global + local installs into a temp dir,
    confirm the three scenarios produce the right file and logs, and confirm a
    double-run is idempotent.

## Testing Strategy

No test runner exists today (no `devDependencies`, no test files). Introduce the
**zero-dependency** Node built-in runner (`node --test`) and a `test` script.
Tests target the pure logic directly; filesystem branches use a temp directory.

### `deepMerge` unit tests
-   merges a new top-level default key into a user object (default key added).
-   user scalar wins over default scalar at the same key.
-   recurses nested objects: `paths.specs` user value preserved while a newly
    added `paths.foo` default key is introduced.
-   orphan key present only in user object survives the merge (F7).
-   array on the user side wins wholesale; no element concatenation (F8).
-   neither input is mutated (assert deep-equality of inputs post-call).
-   idempotence: `deepMerge(d, deepMerge(d, u))` deep-equals `deepMerge(d, u)`.

### `installConfig` behavior tests (temp dir)
-   **fresh:** dest absent → file equals default; returns `action: 'default'`.
-   **upgrade:** dest has a customized `paths.specs` + non-empty `jira.project_key`
    → merged file retains both; returns `action: 'merged'`.
-   **new-key-on-upgrade:** default has a key the user file lacks → present in
    output after merge.
-   **malformed:** dest is `"{ not json"` → `config.json.bak` contains the original
    bytes, `config.json` equals default; returns `action: 'recovered'`.
-   **formatting:** written file is 2-space indented with a trailing newline.
-   **idempotence:** running `installConfig` twice yields a byte-identical file.

### Integration / manual
-   Run `npm run test`. Then a scripted install into a throwaway `HOME`/project to
    confirm the real `postinstall` path emits the correct log line per scenario and
    that the rest of the skill tree still installs (F9 regression guard).

## Future Considerations

-   **Config schema + versioning.** If `config.json` grows or keys get renamed,
    introduce a `config_version` field and a tiny migration step (rename/transform)
    layered on top of the merge. Deliberately out of scope now; the deep-merge +
    orphan-tolerance keeps the door open without committing to it.
-   **Schema validation.** A JSON Schema for `config.json` (sibling to the existing
    `lib/workflows/schemas/`) could validate the merged result and warn on unknown
    keys — complementing, not replacing, the merge.
-   **Other user-owned files.** Today only `config.json` is user-owned;
    `shared/templates/` are product files updated on upgrade. If templates ever
    become user-customizable, the same "merge vs. overwrite" decision must be made
    explicitly for them — this spec sets the precedent (back up, don't clobber).
-   **Reconcile the diverged installed config.** Separately from this change, the
    repo's already-diverged `.claude/skills/shared/config.json` should be reviewed
    so intended customizations (`docs/specs`, `docs/adrs`) are deliberate, not an
    accident the new merge logic would now faithfully preserve forever.
