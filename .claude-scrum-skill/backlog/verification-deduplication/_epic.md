---
title: Verification Deduplication
slug: verification-deduplication
status: open
created: 2026-08-07T20:10:22Z
subdomain: core
---

# Verification Deduplication

Remove verification work that Opus 5 now performs internally. Changed code is currently reviewed by a per-story review agent and again by a 4-lens review panel at cleanup; emulation findings are argued by three agents where two suffice; and the review prompt carries a redundant self-check sentence. Retain the per-story review (it runs while story context is live) and cut the duplicates. The invariant: review coverage must not be lost while removing a reviewer.

## Shared Design Concerns

- Do not add verification steps or double-check/re-verify phrasing anywhere
- Security-lens coverage must survive removal of review_panel
- Edits to adversarial_verify.js must not disturb the inlined normalize_args block, which is DRY-checked against _shared/normalize_args.mjs
