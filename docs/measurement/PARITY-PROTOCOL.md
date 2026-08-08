# Parity Measurement Protocol

**Question:** does the current build on Claude Opus 5 use roughly the same tokens as v2.2.1 did on Claude Opus 4.8?

Two arms, run in separate Claude Code sessions because **the session model is the thing that has to change and only you can change it**. Each arm does identical work from an identical starting commit. The only things that differ are the workflow build and the session model — which is the pair we want compared.

| Arm | Session model | Workflow build | Represents |
|---|---|---|---|
| **A** | Claude Opus 4.8 | tag `opus-4-8` (v2.2.1) | the old world |
| **B** | Claude Opus 5 | `development` @ `a03a80c` | the new world |

Hand this file to a session and say: *"Follow docs/measurement/PARITY-PROTOCOL.md, arm A"* (or arm B). The session does the rest.

---

## Before you start

**Set the session model first, with `/model`.** Everything downstream inherits it, so switching mid-run invalidates the arm. Confirm it took effect before continuing — the running session must report itself as the intended model.

Run the two arms in **separate sessions**. Do not run them concurrently: both use serial-in-tree isolation, which resets the shared working tree between stories, so two live runs corrupt each other.

**Confounders already controlled** — no action needed, listed so you know they were checked:

- `ENGINEERING_BASELINE.md` is byte-identical at `opus-4-8` and at `a03a80c` (1,077 words). The revert made this a non-variable.
- Both arms branch from the same commit, so both face the same codebase.
- Both use the same stories, the same persona preamble, and the same isolation strategy.

---

## Step 1 — Preflight

```bash
cd "/Users/keithgarcia/Code/House of Wolves LLC/claudescrumskill"
git fetch origin --prune
git checkout development && git pull --ff-only
git status --short          # must be empty
git rev-parse --short HEAD  # must print a03a80c
```

If `HEAD` is not `a03a80c`, **stop** — `development` has moved and the two arms would no longer share a base. Re-pin both arms to whatever the new commit is, and record it.

---

## Step 2 — Build this arm's install

**Arm A only** (materialize the v2.2.1 build from the tag):

```bash
B=.claude/skills-measure
rm -rf "$B" && mkdir -p "$B"
git archive opus-4-8 skills lib/workflows lib/guidance | tar -x -C "$B"
mv "$B/lib/workflows" "$B/_workflows"
mv "$B/lib/guidance"  "$B/_guidance"
rmdir "$B/lib"
mv "$B/skills"/* "$B/" && rmdir "$B/skills"
find "$B/_workflows" -name "*.test.*" -delete

# Verify it really is the pre-retune build:
grep -c resolveAgentTier "$B/_workflows/sprint_pipeline.js"   # expect 0
ls "$B/_workflows/review_panel.js"                            # expect present
grep -c claimantPrompt "$B/_workflows/adversarial_verify.js"  # expect >0
```

**Arm B only** (the current build is already installed):

```bash
grep -c resolveAgentTier .claude/skills/_workflows/sprint_pipeline.js  # expect 9
ls .claude/skills/_workflows/review_panel.js 2>/dev/null               # expect absent
```

---

## Step 3 — Cut a fresh branch

Each arm starts clean from the pinned base. **This is mandatory** — if an arm starts from a branch where the work is already done, the agents find nothing to do and the measurement is meaningless.

```bash
# Arm A:
git checkout -b measure/arm-a a03a80c
# Arm B:
git checkout -b measure/arm-b a03a80c
```

---

## Step 4 — Run the pipeline

Invoke the **Workflow** tool. The `args` below are **identical for both arms** — copy verbatim, change nothing.

Per-arm, only these two differ:

| | Arm A | Arm B |
|---|---|---|
| `scriptPath` | `<repo>/.claude/skills-measure/_workflows/sprint_pipeline.js` | `<repo>/.claude/skills/_workflows/sprint_pipeline.js` |
| `releaseBranch` in args | `measure/arm-a` | `measure/arm-b` |

Arm A's build predates the `sessionModel` argument and ignores it; Arm B reads it. Pass it in **both** arms anyway so the args stay identical — and set it to the model that arm is running as (`opus` for both, since 4.8 and 5 are both the opus tier).

```json
{
  "epicSlug": "parity-measure",
  "releaseBranch": "measure/arm-a",
  "backendMode": "local",
  "sessionModel": "opus",
  "isolationStrategy": "serial-in-tree",
  "claudeMdPath": "/Users/keithgarcia/Code/House of Wolves LLC/claudescrumskill/.claude/CLAUDE.md",
  "baselinePath": "/Users/keithgarcia/Code/House of Wolves LLC/claudescrumskill/skills/shared/references/ENGINEERING_BASELINE.md",
  "personaPreambles": {
    "impl": "You are implementing a single story end-to-end. Ship the acceptance criteria as written — not more, not less.\n\nRead the project's CLAUDE.md first and follow every convention it specifies. Read the engineering baseline. Match the style of nearby code. Write tests at the level the project already tests at. Keep the diff scoped to the story.\n\nCRITICAL PROJECT CONSTRAINT: Edit ONLY the repo source — skills/, lib/, bin/, docs/, test/, README.md. NEVER edit .claude/, which holds derived installs including the one executing this pipeline.\n\nDo not add verification steps or 'double-check' / 're-verify' phrasing. Do not pin full model IDs. Do not add bot/AI attribution markers to commit messages."
  },
  "stories": [
    {
      "title": "Document credential resolution in the README troubleshooting section",
      "slug": "document-credential-resolution",
      "acceptance_criteria": [
        "README.md gains a troubleshooting entry explaining how this project's git credential is resolved",
        "It states that .envrc reads the macOS keychain and names the service and account it reads",
        "It gives the command to verify the token is live and the command to replace it",
        "No secrets or token values appear in the documentation"
      ],
      "technical_context": "The project's .envrc exports GH_TOKEN from the macOS keychain. The entry actually written and maintained is service 'jaen-claude-scrum-skill', account 'github'. An older entry, service 'gh-claudescrumskill' account $USER, is written by nothing and its token is expired — a stale entry of that shape is a plausible failure a future contributor will hit. Verification: curl against api.github.com/user with the bearer token, checking for HTTP 200. Replacement: security add-generic-password with -U.",
      "points": 1,
      "executor": "claude",
      "priority": "P3-low",
      "persona": "impl"
    },
    {
      "title": "Add a tiering reference page under docs",
      "slug": "add-tiering-reference-page",
      "acceptance_criteria": [
        "docs/ gains a page documenting the agent tier model",
        "It lists every stage and the model and effort tier it resolves to",
        "It explains what sessionModel does and what omitting it costs",
        "It states which stages vary by story difficulty and which do not, and why implement does not",
        "It is linked from README.md"
      ],
      "technical_context": "The tier model lives in lib/workflows/_shared/resolve_agent_tier.mjs. Stages: detect-layout, implement, review, verify, pr, reset, skeptic, judge, elaborate. Model targets are symbolic: cheapest, one-tier-down, session. The reasoning for implement's exclusion from difficulty tiering is recorded in ADR-0007's amendment — reference it rather than restating it at length. NOTE: on the v2.2.1 build this module does not exist; in that case document the tier model as it is described in ADR-0007 and note the module's absence.",
      "points": 3,
      "executor": "claude",
      "priority": "P2-medium",
      "persona": "impl"
    },
    {
      "title": "Guard that documented workflow args match what the workflow destructures",
      "slug": "guard-documented-workflow-args",
      "acceptance_criteria": [
        "A test extracts the argument names each SKILL.md documents in its workflow invocation block",
        "It extracts the argument names the corresponding workflow script actually destructures from normalizeArgs",
        "It fails when a SKILL.md documents an argument the workflow does not read, or the workflow reads a required argument the SKILL.md never documents",
        "The failure message names the skill, the workflow, and the specific argument",
        "The test passes against the current tree"
      ],
      "technical_context": "Each SKILL.md documents its workflow invocation as a YAML fence listing args (epicSlug, releaseBranch, backendMode, and so on). Each workflow script destructures the same names from normalizeArgs(args, '<name>'). These drifted before — sessionModel was destructured by the workflow but documented by no skill, which is exactly the class of defect this guards. Follow house style: test/ for cross-cutting guards, colocated *.test.mjs for module-level ones.",
      "points": 5,
      "executor": "claude",
      "priority": "P2-medium",
      "persona": "impl"
    }
  ]
}
```

The story mix is deliberate. One story at 1 point and two at 3+ exercise both sides of the `review` tier boundary, and the spread mirrors this repo's real backlog, where 96% of stories are 5 points or fewer.

---

## Step 5 — Capture the results

The Workflow launch prints a **transcript dir** and a **run ID**. When the run finishes, the task notification carries a `<usage>` block. Capture both:

```bash
ARM=a   # or b
OUT="docs/measurement/results/arm-$ARM"
mkdir -p "$OUT"

# 1. The transcript dir printed at launch — copy it whole.
cp -R "<transcript-dir-from-launch-output>"/. "$OUT/transcript/"

# 2. Environment record.
{
  echo "arm: $ARM"
  echo "session_model: <the model you set with /model — write it exactly>"
  echo "build: <'opus-4-8 tag (v2.2.1)' or 'development @ a03a80c'>"
  echo "base_commit: $(git rev-parse HEAD)"
  echo "run_id: <wf_... from the launch output>"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT/env.txt"

# 3. The usage block from the task notification — paste it verbatim.
#    Fields needed: agent_count, agents_done, agents_error,
#                   subagent_tokens, tool_uses, duration_ms
$EDITOR "$OUT/usage.txt"

# 4. What the run actually produced, so quality can be compared too.
git log --oneline a03a80c..HEAD > "$OUT/commits.txt"
git diff --stat a03a80c..HEAD  > "$OUT/diffstat.txt"
npm test 2>&1 | tail -8        > "$OUT/tests.txt"
```

Then share `docs/measurement/results/arm-a` and `arm-b` with me.

**Do not merge either arm.** Both branches are throwaway. If you like one arm's output, cherry-pick it deliberately afterward — but keep it out of the measurement.

---

## What I will compare

**Primary — cost.** `subagent_tokens` A vs B, and the same per point delivered. This is the parity number.

**Secondary — where the tokens went.** Every agent writes a `*.meta.json` in the transcript dir recording its model. Arm A should show no model overrides at all (v2.2.1 assigns none); Arm B should show `haiku` for the mechanical stages and `verify`, `haiku` or `sonnet` for `review`, and no override on `implement`. That decomposes the headline number into which stages actually moved.

**Tertiary — quality.** Same acceptance criteria, both arms: commits, diffstat, and test results say whether the cheaper arm delivered less.

Also worth reading: `agent_count` (should be equal — both are 3 stories on the same pipeline shape) and `duration_ms` (indicative only; machine load confounds it).

---

## How to read the result honestly

**n = 1.** One run per arm. Agent runs vary — the same work twice on the same build can differ meaningfully from nondeterminism alone. Treat a **difference under ~25% as noise**, not signal. A parity claim needs the two arms within that band; a regression claim needs B clearly above A.

**This measures the sprint pipeline only.** `review_panel`'s four lens agents and `adversarial_verify`'s claimant live in the cleanup and emulate phases, which this protocol does not run. Their deletion is real saving that will **not** appear in these numbers — so if the arms come out near parity here, the full-orchestration picture is better than parity.

**Both arms run the same three stories on documentation and test work.** That is a proxy for your real sprints, not a substitute. A run heavy on multi-file refactors would weight `implement` — which is deliberately untiered — far more heavily, and would narrow any gap.

**If the arms come out close:** parity is supported, and the untiered `implement` decision is affordable.
**If B is clearly higher:** Opus 5's thinking-by-default is outrunning the tiering savings, and the next lever is `effort` on `implement` — not its model.

---

## Cleanup after both arms

```bash
git checkout development
git branch -D measure/arm-a measure/arm-b
rm -rf .claude/skills-measure
```

Keep `docs/measurement/results/` — it is the record.
