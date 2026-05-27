# Scaffolding Verification Fixtures

These fixtures exist to verify the two-pass scaffolding and design-spike epic features added by the [Orchestrate Large-PRD Hardening](../20260527_000454_orchestrate_large_prd_hardening.md) spec. They are not production specs — do not scaffold them into the project's real backlog. Use a throwaway directory (`config.json` → `paths.backlog: ./tmp/verification/backlog`) when exercising these.

## Fixtures

| File | Size | Epics | Purpose |
|------|------|-------|---------|
| `small_prd.md` | ~600 words | 1 implementation epic | Verifies that small PRDs continue through the single-pass path with no design-spike injection. |
| `large_prd.md` | ~3700 words, `scaffold_mode: two-pass` frontmatter | 4 implementation epics + auto-injected design-spike | Verifies that two-pass mode (forced via frontmatter override) produces evenly-decomposed stories across all epics and that the design-spike epic auto-injects with concrete CONTEXT.md / ADR material lifted from the PRD's Cross-Cutting Concerns section. |

### Why `large_prd.md` uses the frontmatter override

The word-count heuristic triggers two-pass when a PRD exceeds `scaffold.two_pass_threshold_words` (default 5000). `large_prd.md` is intentionally under that threshold so the file stays reviewable, so it carries `scaffold_mode: two-pass` in its frontmatter to force the two-pass path. This also exercises trigger source #1 (frontmatter override) directly. Word-count-driven triggering is covered by any PRD authored above the threshold and does not require a pre-built fixture.

## Verification Matrix

Reproduce the matrix from the source spec's Testing Strategy section. For each case, scaffold against a temporary backlog path and inspect the output.

| # | Case | Input | Expected Behavior |
|---|------|-------|-------------------|
| 1 | Small PRD, no overrides | `small_prd.md` | Single-pass mode; no design-spike epic; existing behavior preserved. |
| 2 | Large PRD via frontmatter override | `large_prd.md` (has `scaffold_mode: two-pass`) | Two-pass mode triggers via frontmatter; design-spike epic auto-injects (4 implementation epics); ADR + per-epic CONTEXT.md stories appear in the design-spike epic; every implementation story's Technical Context contains the auto-injected `See <paths.context>/<epic-slug>/CONTEXT.md and ADR-NNNN ...` line. |
| 3 | Small PRD with `scaffold_mode: two-pass` frontmatter | Add `scaffold_mode: two-pass` to `small_prd.md` temporarily | Two-pass mode forced; Pass 1 yields 1 epic → auto-downgrade to single-pass elaboration; no design-spike (single implementation epic). |
| 4 | Large PRD with `design_spike: false` | Add `design_spike: false` alongside the existing `scaffold_mode` in `large_prd.md` temporarily | Two-pass mode triggers; design-spike epic suppressed; implementation stories' Technical Context does NOT receive the auto-injected reference line. |
| 5 | Re-scaffold existing project | Scaffold `large_prd.md` twice in succession against the same backlog path | First run creates the design-spike epic; second run detects the existing `epic_type: design-spike` directory and skips re-injection; new stories (if any) added to existing epics without duplicate ADR/CONTEXT.md scaffolding. |
| 6 | Pass 1 failure (simulated) | Scaffold a deliberately malformed PRD (e.g., truncate `large_prd.md` mid-section) | Pass 1 retries once with identical input; on second failure, scaffold announces the fallback and runs single-pass parse against whatever PRD content is present. |
| 7 | Slug collision across Pass 2 subagents | Craft a PRD where two epics each contain a story titled "Add health endpoint" | Story Assembly detects the duplicate slug, prepends epic slug to the second occurrence, logs both renames in the skill output, continues without aborting. |
| 8 | State-file resume | Start `/project-orchestrate` against any PRD; pause mid-execution (Ctrl+C); resume | Resume reads the state file and continues from the recorded position; no retroactive design-spike injection. |
| 9 | Backend parity | Scaffold `large_prd.md` once in each of local, GitHub, Jira, Trello modes (in throwaway projects) | CONTEXT.md and ADR files end up at the same filesystem paths (`<paths.context>/<epic-slug>/CONTEXT.md` and `<paths.adr>/NNNN-<slug>.md`) in all four modes; remote modes additionally surface links in the milestone/epic descriptions. |

## How to Run

Cases 1–7 can be exercised in a fresh shell. Cases 8 and 9 require additional setup:

- **Case 8** requires an interactive interrupt mid-run, which the agent harness does not support directly. Hand-test by invoking `/project-orchestrate` against a PRD, sending SIGINT after the state file is written, then re-invoking the same command.
- **Case 9** requires authenticated `gh` access (GitHub mode), `JIRA_*` env vars (Jira mode), and `TRELLO_*` env vars (Trello mode). Each backend produces its own throwaway project — clean them up by hand after the verification run.

For each case, the verification is observational: inspect the backlog directory (local mode), milestones + issues (GitHub mode), or board (Jira/Trello mode) and confirm the expected structure exists. The fixtures do not include automated assertions — they exist so a human (or a future verification harness) can compare actual against expected.

## Cleaning Up

After running verifications, delete the throwaway backlog:

```bash
rm -rf tmp/verification
```

Remote backends require their own teardown (delete the test repo's milestones/issues, the Jira project, or the Trello board).
