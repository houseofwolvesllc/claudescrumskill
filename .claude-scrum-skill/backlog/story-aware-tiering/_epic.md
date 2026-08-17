---
title: Story-Aware Tiering
slug: story-aware-tiering
status: open
created: 2026-08-07T22:30:26Z
subdomain: core
---

# Story-Aware Tiering

Tiering asks what kind of work a stage is but never how hard the particular story is. Add story difficulty as a second dimension driven by points, with two overrides that cut against cost for ops and P0-critical work, and a mandatory floor on implement so a mis-estimated story degrades gently rather than being handed to the weakest model. The resolver must stay usable where no story exists.

Depends on: tier-contract-plumbing

## Shared Design Concerns

- The implement floor is mandatory: never below one-tier-down at any point value, because points is an estimate authored before anyone read the code
- review may floor lower than implement because a weak review is caught by verify and the tests, whereas a weak implementation IS the artifact
- The story argument must be optional — adversarial_verify has findings, not stories, and passes none
- The existing session clamp still applies: no stage resolves above the session model
- The resolver is inlined into three workflow scripts; any signature change must be re-inlined and stay in sync
