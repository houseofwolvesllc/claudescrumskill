---
title: Claim Gating
slug: claim-gating
status: open
created: 2026-08-20T17:34:14Z
subdomain: supporting
---

# Claim Gating

Two of the run's misreports were the orchestrator claiming work that had not happened: an entire epic reported as launched when it was not, seven of fourteen stories dispatched while the epic was reported underway, and an emulation phase written into the state file as complete when its report directory had not been touched in weeks. In each case the harness held the information needed to catch it. This epic reconciles requested story IDs against returned ones, and gates artifact-producing phases on artifact freshness rather than attestation.

## Shared Design Concerns

- The Workflow runtime has no child_process and no filesystem access (ADR-0006), so any stat is delegated to an agent as the repo-layout probe delegates git; pure comparison logic stays in a _shared/ module so it is unit-testable
- A stale or missing artifact must fail closed — the safe direction
- Gating binds only phases the orchestrator CLAIMS to have run; deliberately skipping a phase and saying so remains available
- Reconciliation is by story ID, not count, so a blocked or failed story still counts as reported
