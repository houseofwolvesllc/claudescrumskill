# ADR-0004: Non-Destructive Config Merge on Install

- **Status:** Accepted
- **Date:** 2026-06-24
- **Deciders:** Keith Garcia (project owner)

## Context

`bin/install.js` (the npm `postinstall` hook) installs the skill suite by
recursively copying the package's `skills/` tree into the install target via
`copyRecursive` → `fs.copyFileSync`, which overwrites unconditionally. This is
correct for product files — skill markdown, `shared/references/`,
`shared/templates/`, and `lib/workflows/` *should* be replaced on every
upgrade. It was wrong for exactly one file: `skills/shared/config.json`.

`config.json` is user-owned configuration: `scaffolding` mode, output `paths`
(specs/adr/backlog/context), `scaffold` thresholds, and integration keys
(`jira.project_key`, `trello.board_id`). Because every `npm install`/upgrade
re-ran `postinstall`, the installer silently overwrote it with shipped
defaults, destroying whatever the user had configured. This was a live defect,
not a hypothetical: this repo's own installed config
(`.claude/skills/shared/config.json`) had already diverged from the shipped
default (`paths.specs: docs/specs` and `paths.adr: docs/adrs` vs. the package
default of `.claude-scrum-skill/specs`), and a re-run would have reverted it.

The source spec
(`docs/specs/20260624_105950_config_merge_preserve_on_install.md`) evaluated
three options: (A) preserve — skip the file if it exists; (B) deep-merge
shipped defaults with the user file; (C) versioned migration. Option A never
delivers new default keys to existing users on upgrade. Option C is overkill
for a small, mostly-flat config.

## Decision

Treat `config.json` as the **single user-owned file** in the install tree and
handle it through a dedicated, testable path (Option B). Every other file
continues to overwrite unconditionally — only `config.json` is special.

- **Exclude `config.json` from the generic copy.** `copyRecursive` gained an
  optional `skipPath`; `shared/` is copied with `config.json` skipped, then the
  file is handled explicitly. There is no other code path that writes it.
- **Three-branch `installConfig(defaultPath, destPath)`** returning
  `{ action }`:
  - dest missing → write the default verbatim (`default`). Fresh installs are
    byte-identical to the prior behavior.
  - dest present + valid JSON → `deepMerge(defaults, user)` with **user values
    winning**, write the result (`merged`). New default keys flow in on upgrade;
    user settings survive.
  - dest present + invalid JSON → back up to `config.json.bak` (original bytes
    preserved), then write the default (`recovered`). Malformed config is never
    silently discarded.
- **`deepMerge` is pure:** recurses plain objects, treats arrays and scalars as
  leaves with the override winning, mutates neither input.

### Two semantic choices worth recording

1. **Orphan keys are preserved, not pruned.** A key present in the user file but
   absent from the shipped defaults (because a future version removed it, or the
   user added it) is left in place. Pruning would risk deleting keys a user
   added intentionally; leaving orphans is the safer default for user-owned
   data. The cost is that genuinely-dead keys linger harmlessly.

2. **Arrays are leaf values, not merged element-wise.** A user array wins
   wholesale; defaults never concatenate into it. The current config has no
   arrays — this is a forward-looking guard so a future array-valued key behaves
   predictably rather than accumulating duplicates across upgrades.

### Testability

The top-level install execution is guarded behind `require.main === module`,
and `{ deepMerge, installConfig }` are exported, so the merge logic is unit-
testable without triggering install side-effects. A zero-dependency
`node:test` suite (`test/install.test.js`, 16 cases) plus a `test` script in
`package.json` cover both functions; `postinstall` is unchanged and no
devDependencies were added.

## Consequences

- **Upgrades stop destroying user configuration** while still delivering new
  default keys — the central goal.
- **Fresh-install behavior is unchanged** (verified byte-identical to the prior
  installer output).
- **A failed config step cannot abort the install.** `installConfig` is wrapped
  in try/catch and runs before the skills copy, so the critical payload (the
  skills) always lands even if config handling throws.
- **Orphan tolerance is now a contract.** A future change that "cleans up"
  unknown keys would reintroduce data loss; this ADR records that the
  non-pruning behavior is deliberate.
- **The `.bak` is overwritten on repeated recoveries** (a second corruption
  before the next valid run clobbers the prior backup). Single-recovery byte
  preservation is guaranteed; multi-recovery rotation is tracked as a P3
  follow-up (`002-followup-bak-rotation`), not part of this decision.
- **The precedent for user-owned files is set:** if `shared/templates/` ever
  becomes user-customizable, the same back-up-don't-clobber treatment applies
  rather than the unconditional overwrite product files get today.
