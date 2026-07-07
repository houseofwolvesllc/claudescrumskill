# Issues — Phase 2 emulation (workflow-execution-robustness)

Supersedes the stale Run-1 report (v2.0.0) previously in this file; the earlier
run's findings predate the current source. Classification:
🔴 Critical / 🟡 Warning / 🔵 Info.

## 🔴 Critical

None.

## 🟡 Warning

None.

## 🔵 Info

### 🔵 I1 — Script carries two runtime-dead inlined functions (`execGit`-injected)
`lib/workflows/sprint_pipeline.js:201` (`detectIsolationStrategy`) and
`:298` (`resetWorktree`) are inlined verbatim from their `_shared` modules but
are **never called in the runtime** — they take an injected `execGit`
(undefined in the runtime; used only by the unit tests). They cannot error
because nothing invokes them, and removing them would break the inline drift
guard (the block must equal the canonical module). This is an accepted
consequence of ADR-0006's whole-module inline approach, but a first-time reader
of the script sees two unused functions referencing an undefined `execGit`.
Optional future refinement: split the pure runtime logic
(`classifyIsolationStrategy`, `resetWorktreeCommands`) from the test-only
`execGit` wrappers so only runtime-live code is inlined. Not required for
correctness.

### 🔵 I2 — Dev-only tooling modules ship in the install payload
`installWorkflows` (`bin/install.js:121-129`) recursively copies `_shared/`, so
`_shared/inline_sync.mjs` and `_shared/inline_manifest.mjs`
(drift-guard/codegen infrastructure, not workflow runtime logic) ship to
`<skills-root>/_workflows/_shared/` and are imported by the smoke check. They
are pure and harmless, but are not consumed at runtime (the runtime cannot
import anything). Minor payload cruft only; flagged against the repo's
"minimal / no dead code" ethos. Could be excluded via the existing skip
predicate if desired.

### 🔵 I3 — `Reset` phase declared but never announced at top level
`sprint_pipeline.js:47-58` `meta.phases` includes `{ title: 'Reset' }`, and
`phase('Reset')` is only ever passed as an `agent(...)` option in serial-in-tree
mode (`:675`) — there is no top-level `phase('Reset')` call the way
`Implement/Review/Verify/Open PR` get one at `:520-523`. Display-only; no
functional impact. Noted for consistency.

## Notes on N/A emulation categories
Auth/RBAC, HTTP endpoints, DB/query isolation, IoC wiring, Docker/deploy,
cross-service contracts — **N/A**: this package has none of those surfaces.
They were not emulated and no findings were invented for them.
</content>
