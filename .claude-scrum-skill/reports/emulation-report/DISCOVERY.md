# Discovery — Roles, Actions, Surfaces

Package: `@houseofwolvesllc/claude-scrum-skill` v2.1.3
Branch: `release/workflow-execution-robustness`
Scope of this pass: Phase 2 emulation-hardening for the workflow-execution-robustness
spec (`docs/specs/20260706_235230_workflow_execution_robustness.md`) + ADR-0006.

## What this package actually is

An npm package that ships **Claude Code skills** (markdown under `skills/`),
**workflow scripts** (`lib/workflows/*.js`, executed by the Claude Code Workflow
tool in a wrapped-eval runtime), shared **references/templates**, internal
**guidance** (`lib/guidance/`), and an **installer** (`bin/install.js`, run as
npm `postinstall`).

It is NOT a web app. There is no auth/RBAC, no HTTP layer, no database, no IoC
container, no Docker, no cross-service surface. The emulation categories that
assume those layers are **N/A** and were not invented.

## Roles (real)

| Role | How it acts | Surface exercised |
|---|---|---|
| **End user** | Invokes slash commands (`/project-scaffold`, `/project-orchestrate`, `/sprint-*`, etc.) | `skills/*/SKILL.md` |
| **npm postinstall installer** | Runs `bin/install.js` on `npm install` | copy skills/workflows/guidance to `<skills-root>`, merge `config.json`, smoke-check |
| **Orchestrator (skill markdown)** | `project-orchestrate` drives the lifecycle, invokes workflow scripts via the Workflow tool | `SKILL.md` → `lib/workflows/*.js` arg contract |
| **Workflow subagents** | `agent(...)` / `parallel(...)` calls inside the workflow scripts do the git/file work (runtime has no `child_process`) | agent prompts in `sprint_pipeline.js` etc. |

## Actions

- **Install**: `bin/install.js` → `installSharedReferences`, `installSkills`,
  `installWorkflows`, `installGuidance`, `verifyWorkflowInstall`, config merge.
- **Invoke skills**: 8 registered skills (`bin/install.js:14-23`) plus 2
  non-registered guidance skills under `_guidance/`.
- **Run workflow scripts** (4): `sprint_pipeline.js`, `review_panel.js`,
  `adversarial_verify.js`, `elaborate_epics.js`. Each reads the injected `args`
  global through `normalizeArgs(args, '<name>')`.

## Runtime contract (from ADR-0006, verified against source)

The Workflow runtime is a wrapped-eval body: top-level `export const meta`,
top-level `return`, and top-level `await` coexist (illegal in real ESM/CJS).
Confirmed globals: `log, phase, console, budget, setTimeout, clearTimeout, Date,
agent, parallel, pipeline, workflow, args`. **No** `import()`, `require`,
`import.meta`, `process`, or `child_process`. Consequently shared logic is
**inlined** into each script from a single `.mjs` source and kept in sync by a
drift test — there is no runtime module loading (verified: `grep -E 'await
import|require\(|^import |import.meta' lib/workflows/*.js` → none).
</content>
</invoke>
