---
title: Telemetry Capture
slug: telemetry-capture
status: open
created: 2026-09-02T22:23:30Z
subdomain: supporting
---

# Telemetry Capture

A new pure factory lib/workflows/_shared/stage_timing.mjs exports createStageTimer(agentFn) returning { timedAgent, timings }. timedAgent awaits the injected agentFn, records startedAt before and endedAt after (ISO-8601 via Date), appends the interval whether the call succeeds, returns null, or throws (finally, then re-throw), and returns the result unchanged. Registered in INLINE_MANIFEST, expanded by regen_workflow_inlines.mjs, guarded by inline_sync.test.mjs, and covered by a tests-first stage_timing.test.mjs.

## Shared Design Concerns

- ADR-0006: workflow runtime has no import/fs/child_process; use only Date (a builtin).
- agentFn is injected, not a closed-over global, so the module is unit-testable under node --test where the runtime agent global is absent.
- ISO-8601 wall-clock timestamps (not performance.now()) so intervals from concurrent stories compose on one timeline, matching the artifact_freshness convention.
- Inline/regen/drift discipline: register in inline_manifest.mjs and keep the inlined block byte-identical to canonical.
