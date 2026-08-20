# M1 — Manual End-to-End Gate: `sprint_pipeline.js`

> Owned by the `end-to-end-emulation-and-verification` epic of
> `docs/specs/20260706_235230_workflow_execution_robustness.md`. This is the ONE
> documented manual gate. It is **not** an automated CI harness — reconstructing
> the wrapped-eval Workflow runtime in a harness is an explicit non-goal.

## What the automated units already prove (E1–E5)

Run first; all must pass:

```bash
npm test           # node --test — every unit suite green
```

- **E1** `normalize_args.test.mjs` — the string/object fail-loud contract.
- **E2** `detect_repo_layout.test.mjs` — the strategy branches against real git.
- **E3** `topological_order.test.mjs` — dependency order, adverse order, cycle throw.
- **E4** `reset_worktree.test.mjs` — the exact reset preserves `node_modules`
  (root + nested) and clears `dist/` from a genuinely conflicting dirty tree.
- **E5** `run_sequential.test.mjs` — order == topo order, one chain in flight,
  reset between every adjacent pair (never after the last), termination on an
  adverse pair.

Because **E5 automates the single-in-flight / ordering / termination guarantees**,
M1's role narrows to **whole-runtime confirmation** — that the driver, detector,
reset, and prompts wire together correctly inside the real Workflow runtime.
E1–E5 green is necessary but not sufficient; M1 must also be executed and
recorded.

## Runtime facts this gate confirms (ADR-0006)

The workflow runtime has no `import()`/`require`/`process`/`child_process`; the
shared logic is **inlined** (not imported) and git is delegated to `agent()`.
`isolation:'worktree'` is a plain `git worktree add` (tracked files only).

A pre-flight parse smoke (cheap, already run during development) confirms the
fully-inlined script loads in the runtime:

```
Workflow({ scriptPath: "<repo>/lib/workflows/sprint_pipeline.js",
           args: { stories: [], epicSlug: "smoke", releaseBranch: "release/smoke",
                   backendMode: "local", personaPreambles: {} } })
# expected result: []   (empty-batch guard; no SyntaxError from any inlined block)
```

## M1 setup — a real ≥2-story serial batch

Use a scratch git repo whose `node_modules` is **untracked** (so `auto` selects
serial-in-tree). One-time:

```bash
M1=$(mktemp -d)
git -C "$M1" init -q
git -C "$M1" config user.email m1@example.com && git -C "$M1" config user.name M1
printf 'node_modules/\ndist/\n' > "$M1/.gitignore"
printf '{ "name": "m1", "scripts": { "test": "node -e \\"process.exit(0)\\"" } }\n' > "$M1/package.json"
mkdir -p "$M1/node_modules/.marker" && printf 'preserve me\n' > "$M1/node_modules/.marker/keep"
git -C "$M1" add . && git -C "$M1" commit -qm init
git -C "$M1" checkout -q -b release/m1
```

Story batch (pass as `args.stories`, `backendMode: "local"`,
`releaseBranch: "release/m1"`, `epicSlug: "m1"`):

| slug | blocked_by | purpose |
|------|-----------|---------|
| `indep-a` | — | independent story #1 |
| `indep-b` | — | independent story #2 (with `indep-a`, surfaces a shared-HEAD race if serialization is wrong) |
| `dependent` | `["blocker"]` | listed **before** its blocker (adverse order → surfaces a deadlock if topo-sort is wrong) |
| `blocker` | — | the blocker, listed after its dependent |

Each story's `acceptance_criteria` should be trivial and file-touching (e.g.
"create `<slug>.txt` containing the slug"), so Implement makes a real commit and
the between-story reset has tracked changes to handle.

## M1 scenarios (run and record each)

Record the returned `SprintStoryReturn[]`, the `log(...)` lines, and the scratch
repo's final `git status`/`git log` for each.

1. **Auto → worktree over untracked deps.** Invoke with `isolationStrategy`
   omitted. The scratch repo's `node_modules` is untracked, but its main tree is
   resolvable, so a fresh worktree can be provisioned and the gate says so.
   **Expect:** a `log` `Isolation strategy: worktree (source=auto, git ls-files
   node_modules: empty)` followed by a `Dependency strategy: clone …` (or
   `install …` if the scratch repo carries a `pnpm-lock.yaml`) outcome line and a
   `Worktree fan-out: N concurrent worktrees — bound by cores: min(16, <host
   cores> - 2 reserved for the host) …` line whose `N` matches the host; stories
   run **concurrently** in isolated worktrees, each carrying the provisioning
   instruction; all four return `status: "done"`; and `git -C "$M1" branch
   --list 'story/*'` shows the four branches namespaced under their epic —
   `story/m1/indep-a` and siblings, never a flat `story/indep-a`.

2. **Dirty-tree carryover (F7b).** Before re-running, leave a conflicting
   uncommitted change and an untracked non-ignored scratch file (e.g. `stray.tmp`)
   in the tree from an aborted attempt.
   **Expect:** the between-story reset (`git reset --hard` → `git checkout -f
   release/m1` → `git clean -fd -e node_modules …`) recovers a clean tree for the
   next story, the scratch file is gone, and every gitignored path survives —
   `node_modules`, the `.claude` install dir, `.claude-scrum-skill` state, and any
   `.env*` secrets (the reset omits `-x`, so ignored files are never touched). No
   story aborts on a dirty checkout.

3. **Forced `isolationStrategy: "serial-in-tree"`.** **Expect:** `log`
   `... (source=override, ...)`; stories run **one at a time** in topological
   order with `blocker` **before** `dependent` (no deadlock); all four return
   `status: "done"`; `node_modules/.marker/keep` still present at the end (reset
   preserved it); no `dist/` or stray files left between stories.

4. **Forced `isolationStrategy: "worktree"` with `dependencyStrategy:
   "assume-present"` on untracked deps (foot-gun).** **Expect:** the prominent
   `WARNING: isolationStrategy override forces 'worktree' with
   dependencyStrategy=assume-present over untracked node_modules …` line, then
   the run **proceeds** (warn-and-proceed) using worktree isolation. (Builds
   needing deps may fail — that is the operator's declared risk.)

5. **Simulated detector throw / non-git.** Point the run at a **non-git**
   directory (or otherwise make `git ls-files node_modules` error). **Expect:**
   `git ls-files node_modules: command-error`, strategy falls back to
   **serial-in-tree**, and the **batch is NOT killed** by the detector failure.

6. **Disk-bound fan-out.** Put the scratch repo on a deliberately small volume
   (e.g. a ~2 GB disk image or `tmpfs` mount) and give it a `node_modules` large
   enough that only two or three copies fit in 80% of the free space.
   **Expect:** a `Worktree fan-out: N concurrent worktrees — bound by disk (…
   spendable of … free, at … per worktree). Cores would have allowed …` line
   with `N` **below** the core bound, **at most `N` worktrees present at any one
   moment** (watch `git worktree list` while it runs), and the volume never
   fills. Shrink the volume until one worktree alone exceeds the budget and the
   line becomes the `WARNING: … a single worktree already exceeds the budget …`
   variant with `N == 1`.

7. **Unprovisionable worktree.** Force the provisioning command to fail in the
   worktrees — e.g. run under `dependencyStrategy: install` with the registry
   unreachable, or under `clone` with the main tree's `node_modules` removed.
   **Expect:** the affected stories return `status: "infrastructure-failed"`,
   **not** `"failed"`, with a `reason` naming the strategy that failed and
   quoting what the worktree reported; no review or verify stage runs for them;
   and a story that instead breaks its own build still returns `"failed"`.

8. **Verification standing in the wrong tree.** After a story commits, move the
   verify stage off its commit before it reads anything — e.g. reset the shared
   tree to the release branch between the implement and verify stages, so the
   story's files are absent from the tree the verify agent is placed in.
   **Expect:** the story returns `status: "infrastructure-failed"` with a
   `reason` naming the revision the tree should have been at and quoting what
   `git rev-parse HEAD` printed instead — **not** a verify finding that the
   story's files are missing or its directories empty, and **not**
   `status: "blocked"`.

## Gate

**PASS** requires: `npm test` green (E1–E5) **AND** every M1 scenario above
executed with the expected observation recorded. If any fails, the change is not
shippable regardless of unit green.

## Cleanup

```bash
rm -rf "$M1"
```
