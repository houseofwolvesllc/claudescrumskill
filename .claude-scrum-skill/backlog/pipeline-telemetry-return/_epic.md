---
title: Pipeline Telemetry Return
slug: pipeline-telemetry-return
status: open
created: 2026-09-02T22:23:30Z
subdomain: supporting
---

# Pipeline Telemetry Return

Route every agent() call in sprint_pipeline.js through timedAgent built once from createStageTimer(agent), and attach the collected intervals to the workflow's return value on a top-level _telemetry field. Extend the workflow return schema so _telemetry is a described, validated field. Verify the current return shape first so the addition is non-breaking.

## Shared Design Concerns

- Transparency: no change to stage behavior, ordering, inputs, outputs, or error semantics.
- Return-shape reconciliation: confirm the top-level return is an object before adding _telemetry; if it is a bare array, reconcile so the addition is non-breaking and update the consumer read.
- The _ prefix marks _telemetry as out-of-band so consumers iterating story results skip it.
