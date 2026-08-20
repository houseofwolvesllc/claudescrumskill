# Architecture Decision Records

One file per decision, numbered in the order the decision was taken. This index gives
each one a single line so a reader can find the right record; the record itself carries
the context, the decision, and what it cost.

| ADR | Decision |
| --- | --- |
| [0001](0001-two-pass-scaffolding-and-design-spike-epic.md) | Parse a large PRD as a skeleton pass plus one subagent per epic, and inject a design-spike epic ahead of implementation. |
| [0002](0002-multi-spec-sequential-orchestration.md) | Run multiple PRDs one at a time — each spec gets a complete isolated lifecycle, ordered by its `depends_on` declarations. |
| [0003](0003-workflow-backed-re-plumbing.md) | Split the suite in two layers: `SKILL.md` owns the opinion and the user surface, `lib/workflows/` owns the fan-out substrate. |
| [0004](0004-non-destructive-config-merge-on-install.md) | Overwrite every installed file except `config.json`, which is merged so a user's settings survive an upgrade. |
| [0005](0005-internal-guidance-skills-fixed-path.md) | Move internal guidance out of `skills/` to `lib/guidance/`, installed at a fixed path so it can never register as a user-facing skill. |
| [0006](0006-workflow-execution-robustness.md) | Inline shared logic into each workflow script and make isolation layout-aware, because the Workflow runtime offers no module loader. |
| [0007](0007-model-coupled-prompt-surface.md) | Delete the prompt-surface workarounds written for an earlier model, and set model and effort per agent call instead of inheriting the session tier. |
| [0008](0008-worktree-dependency-provisioning.md) | Select worktree parallelism on whether a worktree can obtain dependencies, not on whether they are tracked in git. |
| [0009](0009-verify-claims-not-attestations.md) | Gate a phase on its own artifact rather than on the orchestrator's claim, and point verification at a commit rather than a branch. |
| [0010](0010-worktree-teardown.md) | Reclaim only the worktrees a sprint can prove it created — under the harness's directory and on a landed branch or a merged commit — never by a blanket prune. |
| [0011](0011-the-pipeline-states-the-facts-it-owns.md) | Stamp a story's slug and branch from the pipeline's own values rather than reading them back off the reporting agent, and log any disagreement. |

## The verification arc — 0006 through 0011

ADRs 0006 through 0011 are one argument made across six releases: **the harness should
check rather than trust.** Each removes an assumption the suite had been standing on.

- **0006** stops assuming a workflow script runs in the environment its author had, and
  makes execution prove out against the layout it actually finds.
- **0007** stops assuming the model still behaves as the prompts were written for. Work
  the model now does unprompted leaves the prompt surface, so what remains is checking
  the harness can perform itself.
- **0008** stops assuming an untracked `node_modules` means a worktree cannot run, and
  escalates a dependency-touching story to an install that proves the tree is clean.
- **0009** stops assuming a report of completion is evidence of it, and reads completion
  off the artifact the phase was supposed to produce.
- **0010** stops assuming the harness reclaims what a sprint creates, and reclaims it by
  a rule that can name why each worktree was safe to remove.
- **0011** stops assuming a reporting stage knows facts the pipeline itself assigned, and
  states them rather than reading them back.

Read in order, they are the record of how this suite learned to distrust its own
accounting. A reader who only wants that story can read these six and skip the rest.
