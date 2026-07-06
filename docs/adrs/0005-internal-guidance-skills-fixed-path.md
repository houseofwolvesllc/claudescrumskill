# ADR-0005: Internal Guidance Skills Resolved by Fixed Non-Registered Path

- **Status:** Accepted
- **Date:** 2026-07-06
- **Deciders:** Keith Garcia (project owner)

## Context

The `design-patterns` (Gang of Four catalog) and `domain-modeling` (tactical
DDD) guidance are **internal**: `/project-orchestrate` injects them into the
implementation and review subagent prompts for `core`-subdomain epics only (see
`docs/specs/20260618_132133_design_guidance_layering.md`). They are not invocable
slash commands and were never meant to appear in the user-facing skill registry.

Two facts collided. The guidance files shipped under `skills/`, but
`bin/install.js` copies skills from a **hardcoded list** (the `skills` array)
that never included them. So in every published version from 1.7.0 through
2.1.2, `postinstall` skipped both files — `.claude/skills/design-patterns/` and
`.claude/skills/domain-modeling/` were never created in any consumer install.

Compounding this, `/project-orchestrate`'s resolution step was under-specified.
It instructed the orchestrator to "resolve the absolute `SKILL.md` paths" without
saying **where** they live. With the files absent from the install tree, a
thorough Claude instance would hunt them down in `node_modules` while a lazy one
would fail to find them and silently fall back to the baseline. The observable
effect was **flaky situational-guidance injection**: the same `core` epic could
receive the guidance or not, run to run, depending only on how hard the
orchestrator looked.

This surfaced two constraints in tension:

1. **Deterministic resolution.** The orchestrator must resolve the guidance to
   one fixed, install-layout-agnostic path — no probing `node_modules`, which
   breaks under global installs, plugin layouts, and package-manager hoisting.
2. **Must not register.** The guidance must land in the install tree without
   Claude Code registering it as a user-facing skill.

The package already solves this exact shape for workflow scripts.
`installWorkflows()` copies `lib/workflows/` → `<skillsDir>/_workflows/`, and the
underscore prefix keeps Claude Code from registering the directory as a skill.
`/project-orchestrate` resolves the workflow script by a fixed `<skills-root>`
derivation (the parent directory of its own `SKILL.md`'s parent), which is
already documented and works across global, local, and plugin layouts.

## Decision

Apply the `_workflows/` pattern to the guidance (**Option C**).

- **Source moves to `lib/guidance/`.** `skills/design-patterns/` and
  `skills/domain-modeling/` become `lib/guidance/design-patterns/` and
  `lib/guidance/domain-modeling/`. Content is unchanged. This takes them out of
  the `skills/` tree entirely, so no future change to the `skills` copy list can
  accidentally register them.
- **Dedicated installer step.** `bin/install.js` gains
  `GUIDANCE_SOURCE_DIR` and `installGuidance(skillsDir)`, mirroring
  `WORKFLOWS_SOURCE_DIR` and `installWorkflows()` exactly: if the source exists,
  `copyRecursive` it to `<skillsDir>/_guidance/` and log the step. `main()` calls
  it right after `installWorkflows()`. The underscore prefix prevents skill
  registration, same as `_workflows/`.
- **Deterministic resolution in `/project-orchestrate`.** Both the Step 3b prose
  and the Invocation YAML now name the two paths explicitly:
  `<skills-root>/_guidance/design-patterns/SKILL.md` and
  `<skills-root>/_guidance/domain-modeling/SKILL.md`, using the same
  `<skills-root>` derivation already documented for `_workflows/`. There is
  exactly one place to look.

### Why not the alternatives

- **Reference `node_modules` directly.** Rejected. The install may be global
  (`~/.claude/skills/`), a plugin layout, or hoisted by the package manager to a
  parent `node_modules`. There is no single reliable `node_modules` path, which
  is precisely the non-determinism that caused the flakiness.
- **Add them to the `skills` copy list.** Rejected. That copies them into
  `<skillsDir>/design-patterns/` and `<skillsDir>/domain-modeling/`, where Claude
  Code registers them as user-facing invocable skills. They are internal
  orchestrator-injected guidance, not slash commands — registering them would
  expose an interface the design never intended.

## Consequences

- **Injection is deterministic.** Every install lands the guidance at a fixed
  `_guidance/` path the orchestrator resolves the same way every run. The
  thorough-vs-lazy flakiness is gone.
- **The guidance stays out of the user-facing registry.** The underscore prefix
  keeps `_guidance/` unregistered, exactly like `_workflows/`. The root
  `marketplace.json` had also enumerated both skills at their old `skills/` paths
  — stale after the move and, worse, the one manifest that would surface them as
  discoverable marketplace entries. Those two entries were removed, leaving the
  eight real skills, consistent with the installer's copy list.
- **The `_workflows/` precedent is now a pattern, not a one-off.** Internal,
  non-registered payloads that ship in the install tree live under `lib/` in
  source and install to an underscore-prefixed directory. A future third payload
  follows the same three steps.
- **The design record was corrected.** The 2026-06-18 "as built" addendum
  claimed the guidance was built and validated; it was authored but never
  installed. A dated correction addendum records the omission and the fix.
- **No consumer migration.** The guidance was never present in any install, so
  no consumer has a stale `design-patterns/` or `domain-modeling/` directory to
  clean up. Fresh installs and upgrades simply gain `_guidance/`.
