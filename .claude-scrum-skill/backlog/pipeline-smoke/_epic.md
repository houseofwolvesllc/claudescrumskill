---
title: Pipeline Smoke
slug: pipeline-smoke
status: open
created: 2026-08-07T21:40:00Z
subdomain: supporting
---

# Pipeline Smoke

A single trivial story whose only purpose is to exercise the newly tiered
sprint pipeline end to end. The tiering work changed every agent call site but
was implemented against the pre-tiering pipeline snapshot, so the tiered code
has never actually executed. This epic runs it once.
