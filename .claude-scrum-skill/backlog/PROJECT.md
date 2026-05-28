---
name: Multi-Spec Sequential Orchestration
created: 2026-05-28T05:04:12Z
sprints: []
---

# Multi-Spec Sequential Orchestration

Formalize `/project-orchestrate`'s behavior when given multiple PRD paths. Default becomes sequential per-spec orchestration: each spec receives its own complete orchestration (Phase 1 → Phase 2 → Phase 3 → ADR → state cleanup) before the next begins. Inter-spec ordering can be overridden by `depends_on` PRD frontmatter via topological sort. Opt-in `--skip-on-pause` advances the queue when one spec hits a safety gate; opt-in `--merged` preserves the legacy unified-multi-spec behavior with a deprecation warning.

Single-path, repo-identifier, and no-arg invocations are unchanged from v1.7.1.

Source spec: `docs/specs/20260527_215752_multi_spec_sequential_orchestration.md`
