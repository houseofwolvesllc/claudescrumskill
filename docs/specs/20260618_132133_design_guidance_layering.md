# Design Guidance Layering — GoF, DDD & TDD Across Root, Spec, and Orchestration

> **Document type: Design Record.** This is not a sprint or build plan. Its
> purpose is to capture *placement decisions and their rationale* — the "why"
> that will be invisible in the finished `CLAUDE.md` and skill files — plus the
> exact wording those files must carry. The "Implementation Plan" section is a
> five-edit checklist, not an epic/story breakdown.
>
> **Architecture: Option C (composition).** The GoF and DDD guidance is **not**
> autonomously surfaced mid-edit by the model. It is authored once as thin
> modules and **pulled in by `project-spec` (design time) and
> `project-orchestrate` (implementation time)**. Independent invocation of the
> modules stays possible but is not the design center.

## Implementation Addendum (as built — 2026-06-18)

This section supersedes the original A1 placement below. During implementation two
corrections were made:

1. **The baseline belongs in the package, not a personal global file.** The
   original A1 spec'd Clean Code + TDD + the arbitration line into the user's
   `~/.claude/CLAUDE.md`. That was wrong: the package ships to everyone and cannot
   rely on any user's personal global. **Clean Code + TDD + the Arbitration Rule
   now live as a shared package baseline** that both tool skills load and inject
   into every subagent: `skills/shared/references/ENGINEERING_BASELINE.md`.
2. **All deliverables are package source under `skills/`, `lib/workflows/`, and
   `docs/`** — never the git-ignored installed copies (`.claude/`,
   `.claude-scrum-skill/`). Edits were made directly (not via an orchestrated
   self-rewriting run).

**Files created/modified (all built and validated):**

| File | Change |
|------|--------|
| `skills/shared/references/ENGINEERING_BASELINE.md` | **New.** Clean Code + TDD + Arbitration Rule. The universal baseline layer. |
| `lib/guidance/design-patterns/SKILL.md` | **New.** Counterweight-first, faithful 23-pattern GoF catalog. (Originally authored under `skills/`; relocated to `lib/guidance/` — installs to `_guidance/` — per the 2026-07-06 correction below.) |
| `lib/guidance/domain-modeling/SKILL.md` | **New.** Decision-oriented tactical DDD. (Originally authored under `skills/`; relocated to `lib/guidance/` — installs to `_guidance/` — per the 2026-07-06 correction below.) |
| `skills/project-spec/SKILL.md` | Reads baseline; adds strategic-DDD pass (with `core`/`supporting`/`generic` subdomain classification) + GoF candidate pattern-naming; emits `subdomain` per epic. |
| `skills/project-scaffold/SKILL.md` | Persists the epic `subdomain` from the spec into epic metadata (`_epic.md` frontmatter in local mode; `subdomain:<value>` label in remote modes), and into the Pass-1 epic skeleton. This is the carrier that makes the gate work in all orchestration modes. |
| `skills/project-orchestrate/SKILL.md` | Reads baseline + mandates it for subagents; reads each epic's `subdomain` from epic metadata; passes `baselinePath` always and `situationalGuidance` (design-patterns + domain-modeling) for `core` epics only. |
| `lib/workflows/sprint_pipeline.js` | Threads `baselinePath` (always) and `situationalGuidance` (core epics) into the implementation + review subagent prompts. |
| `lib/workflows/schemas/SpecSchema.json` | Adds the `subdomain` enum to the Epic definition. |

**End-to-end data flow (single-sourced):** `project-spec` classifies each epic's
`subdomain` → `project-scaffold` persists it into epic metadata → `project-orchestrate`
reads it from that metadata → `sprint_pipeline.js` injects the baseline always and
the situational guidance for `core` epics. The classification is written once and
read downstream — never re-derived. This works across single-spec, no-arg, and
repo-identifier orchestration modes.

**Out of scope as built:** the user's personal `~/.claude/CLAUDE.md` (untouched).
The two new skills remain **standalone-invocable**; their primary path is
composition by the tool skills above.

**Source-grounding pass (2026-06-18).** After the initial authoring (reconstructed
from knowledge), the guidance was grounded against the actual source PDFs in
`_reference/` via `pdftotext`. The value of the pass was reading the real source
text and correcting inaccuracies; the corrected content is expressed in this
project's **own words (close paraphrase)** — see the copyright note below.
- `design-patterns` — all 23 pattern intents reconciled against GoF and rewritten
  as paraphrased descriptions, each with a practical "reach for it" line.
- `domain-modeling` — entity, value object, aggregate, repository, factory,
  service, and ubiquitous-language guidance reconciled against Evans (2003) and
  paraphrased.
- `ENGINEERING_BASELINE.md` — TDD section grounded in Beck's red/green/refactor
  rhythm (with the "Three Laws" correctly attributed to Robert C. Martin's
  formulation, not Beck); Clean Code section reconciled against Martin and
  paraphrased.
- **Fidelity finding:** Domain Events are **not** in Evans's 2003 text (a later
  addition); the skill now flags this provenance rather than presenting them as
  original canon.

**Copyright posture (2026-06-18).** Principles, methods, and ideas are not
copyrightable (only specific expression is). To avoid any question from shipping an
open-source package, the grounding was kept as **close paraphrase, not verbatim
quotation** — in particular the GoF Intent lines are paraphrased, not reproduced.
The four works are credited as intellectual sources in `NOTICE` (which propagates
under Apache-2.0) and in the README's **Acknowledgments** section. Attribution is
provided for integrity and respect, independent of the (now sidestepped) fair-use
question.

## Correction: guidance skills shipped in source but never installed (2026-07-06)

The "as built — 2026-06-18" record above claimed the `design-patterns` and
`domain-modeling` guidance was **built and validated**. The authoring was real,
but the guidance never reached a single consumer: the two `SKILL.md` files lived
under `skills/`, yet `bin/install.js` copies skills from a **hardcoded list**
(the `skills` array) that never included them. In every published version from
1.7.0 through 2.1.2, `postinstall` therefore skipped both files —
`.claude/skills/design-patterns/` and `.claude/skills/domain-modeling/` were
never created in any consumer install.

Because the files were absent, `/project-orchestrate`'s resolution step was
under-specified — it told the orchestrator to "resolve the absolute `SKILL.md`
paths" without saying **where**. A thorough Claude instance would hunt them down
in `node_modules`; a lazy one would fail to find them and silently fall back to
the baseline. The result was **flaky situational-guidance injection** for
`core`-subdomain epics: the same run could inject the guidance or not, depending
on how hard the orchestrator looked.

**The fix (Option C — mirror `_workflows/`).** The two files move to
`lib/guidance/` in source, and a dedicated installer step
(`installGuidance()` in `bin/install.js`) copies them to `<skillsDir>/_guidance/`
— exactly as `installWorkflows()` ships `lib/workflows/` to `_workflows/`. The
underscore prefix keeps Claude Code from registering them as user-facing skills,
which they were never meant to be: they are **internal guidance the orchestrator
injects**, not invocable slash commands. `/project-orchestrate` now resolves them
by a fixed, install-layout-agnostic path —
`<skills-root>/_guidance/design-patterns/SKILL.md` and
`<skills-root>/_guidance/domain-modeling/SKILL.md`, using the same `<skills-root>`
derivation already documented for `_workflows/` — so there is exactly one place
to look and no `node_modules` hunting. Their source location is now
`lib/guidance/` (updated in the table above); their install location is
`_guidance/`. See ADR-0005.

---

## Overview

We are extending an existing Claude Code skills setup to absorb guidance from
three more books — *Design Patterns* (Gamma, Helm, Johnson, Vlissides / "GoF"),
*Domain-Driven Design* (Eric Evans), and *Test-Driven Development: By Example*
(Kent Beck) — alongside the already-distilled *Clean Code* (Robert Martin) that
lives in the root `CLAUDE.md`.

The governing question is **placement, not content**: where does each book's
guidance belong so it fires when useful and stays silent (and harmless) when
not? The answer is not uniform, and two of the books split internally into parts
that want different homes. Clean Code earned an always-on home; TDD joins it as
universal; GoF and DDD become **composed modules** that the existing
orchestration skills invoke at the right phase, rather than always-on context or
autonomously-triggered skills.

## Objectives

### Primary

-   Establish a single, explicit **placement principle** so future guidance can
    be slotted without re-litigating the question each time.
-   Decide and record the home of each book's guidance.
-   Specify how the two new modules (`design-patterns`, `domain-modeling`) are
    **composed by `project-spec` and `project-orchestrate`**, including the
    core-vs-generic gating that keeps them off CRUD/script work.
-   Record the conflicts with the existing Clean Code / simple-design principles
    and the single arbitration line that reconciles them.

### Secondary

-   Capture the resolved decision log so the rationale survives beyond this
    conversation.
-   Keep the root `CLAUDE.md` lean: one arbitration line added, no catalog dumps.

## Background — The Placement Principle

Clean Code belongs in the always-on root `CLAUDE.md` because it scores well on a
**two-axis test** any guidance can be measured against:

1.  **Firing frequency** — does it apply to nearly every edit, or only in
    specific situations?
2.  **Cost of being always-on** — when present but *not* needed, is that
    harmless (wasted tokens) or harmful (it pushes behavior the wrong way)?

Clean Code is **high-frequency + harmless-when-idle** → root.

GoF and DDD fail the second axis: they are **harmful when idle**. An always-on
pattern catalog pulls the model toward unearned abstraction, contradicting Clean
Code's "every abstraction is earned" and Beck's simple design. The model already
over-applies patterns; always-on GoF would amplify a known failure mode.

**How Option C resolves harm-when-idle.** Rather than demote the guidance to a
skill the model might autonomously fire, we make it **invocation-gated by the
orchestration skills**. The modules load only when `project-spec` or
`project-orchestrate` pull them in, and at implementation time only for epics
classified as core domain. They are never idle-loaded, so harm-when-idle drops
to zero without sacrificing reach.

**Key structural insight:** each of the three books is internally split into
parts that want *different* homes. Treating a book as a single placement unit is
the main error to avoid.

## Decision Summary

| Guidance | Home | Loaded when |
|---|---|---|
| Clean Code (existing) | Root `CLAUDE.md` | Always |
| **TDD — quality bar** (FIRST, one-concept-per-test, tests first-class) | Root `CLAUDE.md` (already present) | Always |
| **TDD — workflow** (red-green-refactor, test-first, small steps) | Root `CLAUDE.md` (universal) | Always |
| **Strategic DDD** (bounded contexts, ubiquitous language, subdomain classification) | Folded into `project-spec` | Design time |
| **GoF — pattern-naming** (candidate / justified / revisitable) | Folded into `project-spec` | Design time |
| **Tactical DDD** (entities, value objects, aggregates, invariants) | `domain-modeling` module | Design time (advisory, via spec) + implementation time (active, via orchestrate, core epics only) |
| **GoF — refactor target** (faithful 23-pattern catalog) | `design-patterns` module | Design time (advisory, via spec) + implementation time (active, via orchestrate, core epics only) |

### Final artifact inventory (five edits)

-   **Root `CLAUDE.md`** — Clean Code (existing) + TDD full (quality present;
    confirm workflow is universal) + **one arbitration line** (new).
-   **`project-spec`** (extend) — strategic-DDD pass (incl. per-epic `subdomain`
    classification) + GoF pattern-naming pass (candidate / justified /
    revisitable).
-   **`project-orchestrate`** (extend) — read each epic's `subdomain` tag; for
    `core` epics, inject the `design-patterns` + `domain-modeling` guidance into
    the implementing subagent's prompt; default off when untagged.
-   **`design-patterns` module** (new) — thin skill: counterweight-first +
    faithful classic 23-pattern catalog. Invoked by the parents; independently
    invocable too.
-   **`domain-modeling` module** (new) — thin skill: decision-oriented tactical
    DDD. Invoked by the parents; independently invocable too.

## Per-Book Decisions & Rationale

### TDD (Beck) → Root `CLAUDE.md`, universal

**Decision:** TDD is universal. Both halves live in root.

-   **Quality bar** (FIRST, one concept per test, boundary testing, tests are
    first-class) is *already* in the root "Tests" section. No move required.
-   **Workflow** (red-green-refactor, write the failing test first, take a
    smaller step when stuck — fake-it then triangulate) is promoted to universal
    and stated explicitly in root.

**Why root, not project-level:** the user declared TDD universal, not a
per-project choice. A process commitment applied everywhere is high-frequency +
harmless-when-idle → root. The earlier "workflow → project CLAUDE.md" idea is
**dropped**.

**Overlap to resolve:** root already states the three laws of TDD. The edit
*confirms and completes* the workflow without introducing a duplicate TDD block.
No project-level TDD section is created.

**No TDD skill.** Beck's technique is thin enough that root + the model's
existing knowledge suffices. A skill is deferred unless the model is later
observed taking too-large steps.

### GoF (Gang of Four) → `design-patterns` module, composed at two phases

**Decision:** GoF lives as one thin module, authored once, with **one face per
phase** rather than two skills:

-   **Design time** (via `project-spec`) — names *candidate* patterns against
    real axes of variation (advisory).
-   **Implementation time** (via `project-orchestrate`, core epics only) —
    refactors *toward* a named pattern when the variation actually materialized
    (active, counterweighted).

The module presents the **faithful classic 23-pattern catalog** (decided: not
modernized), counterweight-first.

**Why a composed module, not root and not an autonomous skill:** harm-when-idle.
The user's workflow is `project-spec` → `project-orchestrate`, so the guidance
is reached *through* those skills, not by the model picking it up during a random
edit. Composition gives the reach without the idle cost.

**Why the counterweight is mandatory:** a naive catalog makes the model dutifully
satisfy it. The module opens with the anti-over-engineering guard ("you almost
certainly do not need a pattern; prefer the simplest thing; arrive at patterns
by refactoring in response to real duplication, never by anticipation") *before*
the catalog. The honest framing is **Refactoring to Patterns**: a pattern is a
destination you refactor toward, not a starting design.

**Faithful catalog (decided):** all 23 patterns as written. The counterweight
preamble — not selective omission — is what prevents ceremonial use of the
patterns that collapse into language features (Strategy as a function, Command
as a closure, Iterator as built-in).

### DDD (Evans) → Split: strategic into spec, tactical into the `domain-modeling` module

**Decision:** DDD is two books under one cover and is split accordingly.

-   **Strategic DDD** (bounded contexts, ubiquitous language, context mapping,
    subdomain distillation) is **folded directly into `project-spec`**. This is
    the strongest placement in the plan — strategic DDD *is* spec-time work. It
    also produces the **per-epic `subdomain` classification** that gates
    implementation-time guidance (see Q2 resolution).
-   **Tactical DDD** (entities, value objects, aggregates, repositories, domain
    services, domain events, invariants) becomes the **`domain-modeling`
    module**, composed at design time (advisory, shaping the spec) and
    implementation time (active, for core epics).

**Why the gate excludes CRUD for free:** Evans himself scopes DDD to the complex
*core domain*, not generic/supporting subdomains. The dormancy condition is the
book's own thesis. In Option C it is expressed as the `subdomain` classification,
not as an invocation gate.

**Evidence this project already partially adopted tactical DDD:** the project
`CLAUDE.md` already encodes core-package-with-zero-deps, repository abstractions,
domain types, and row-to-domain mapping in private methods. That validates
"tactical DDD lives at project level when adopted" and clarifies the *module's*
job: the deeper modeling judgment a project bullet cannot carry — where an
invariant lives, aggregate boundaries, entity-vs-value-object, language drift.

## Artifact Specifications

### A1 — Root `CLAUDE.md`: arbitration line + TDD confirmation

**Add one arbitration line** that pre-subordinates all pattern/domain guidance to
simple design, so the modules arrive into a context that already says "justify
yourself." Proposed wording:

> Simple design is the default. Abstractions, design patterns, and domain layers
> are responses to demonstrated complexity — duplication, repeated change in one
> place, or essential domain rules — never anticipatory architecture. Arrive at
> patterns by refactoring toward them, not by designing to them.

**TDD workflow confirmation** in the existing "Tests" section (three laws and
FIRST already present):

-   Red-green-refactor: write a failing test, make it pass with the simplest
    code that works, then refactor. Always.
-   When a step is hard, take a smaller one: fake the implementation to get to
    green, then triangulate to the real one.

**Constraint:** no second TDD block anywhere; no project-level TDD section.

### A2 — `project-spec` extension: strategic DDD + GoF pattern-naming + subdomain tagging

Add two passes to the spec-generation flow, surfaced **only** within
`project-spec` (composition), never by broadening any standalone description:

-   **Strategic DDD pass** — capture the ubiquitous language, candidate bounded
    contexts, and **classify each epic's subdomain as `core` / `supporting` /
    `generic`** (subdomain ≈ bounded context ≈ epic). This classification is the
    single authoritative source consumed by `project-orchestrate` (A3). Record it
    as epic-level metadata that rides the existing spec → scaffold → story
    pipeline.
-   **GoF variation/pattern pass** — identify axes of expected variation and name
    candidate patterns, **bound by this guardrail** (decided: naming is wanted):

    > A pattern named in a spec is **candidate, justified, and revisitable** —
    > never binding. Format: `Pattern — because <real axis of variation>;
    > revisit at build (may collapse to a function or simpler form if the
    > variation does not materialize)`.

### A3 — `project-orchestrate` extension: gate guidance on subdomain

At implementation time, `project-orchestrate` spawns a subagent per story (each
already reads `CLAUDE.md` and a persona preamble). Add this gating:

-   **Read the epic's `subdomain` tag** (set by A2). For `core` epics, **inject
    the `design-patterns` + `domain-modeling` module guidance** into the
    implementing subagent's prompt — *active* mode (the subagent applies it while
    writing code).
-   For `supporting` / `generic` epics, **omit the guidance.** The Clean Code
    "simplest thing that works" default governs; no pattern pressure.
-   **Fail-safe default:** if a spec was not produced by the extended
    `project-spec` and carries no `subdomain` tags, treat epics as generic →
    inject nothing. Harm-when-idle stays zero; the modules remain available for
    manual invocation.
-   **Classify once, never re-derive.** Domain understanding lives in the spec
    (A2); orchestrate only *reads* the tag. Re-judging core-vs-generic per story
    at implementation time would duplicate that knowledge (violates the
    single-representation rule).
-   **Active is counterweighted.** The subagent applies the guidance *subordinate
    to the root arbitration line*: implement the simplest thing that satisfies
    the spec; reach for a pattern only when the spec's candidate pattern is
    justified by variation that materialized; a flagged pattern may still
    collapse to a function. Coarse by design — a lone invariant inside a generic
    epic still has the root arbitration line and can pull `domain-modeling`
    manually if truly needed.

### A4 — `design-patterns` module (new)

Thin top-level skill. Because it is invoked by name from the parents, the
front-matter `description` is a module-purpose statement, not an autonomous
invocation gate; it is written conservatively so it does not fire on CRUD if
encountered standalone:

> Faithful Gang of Four design-pattern catalog for complex core-domain design.
> Used by `project-spec` (to name candidate patterns) and `project-orchestrate`
> (to refactor toward a named pattern during implementation of core epics). Not
> for CRUD, scripts, or glue code — prefer the simplest thing that works.

**Body structure (progressive disclosure):**

1.  Counterweight preamble (anti-over-engineering; refactor-toward-patterns).
2.  The faithful 23-pattern catalog (creational / structural / behavioral), kept
    in the body or linked files so the loaded surface stays small.

### A5 — `domain-modeling` module (new)

Thin top-level skill, parallel to A4:

> Tactical Domain-Driven Design for modeling complex core domains — rule
> placement, aggregate boundaries, entity-vs-value-object, domain events,
> invariants, ubiquitous-language alignment. Used by `project-spec` (advisory,
> shaping the spec) and `project-orchestrate` (active, implementing core epics).
> Not for CRUD, generic/supporting subdomains, plumbing, or simple persistence —
> per Evans's core-domain scoping.

**Body structure:** decision-oriented tactical building blocks (entity, value
object, aggregate + root, repository, domain service, domain event, factory),
guiding *decisions* rather than serving as a glossary.

## Conflicts & Reconciliation

| Conflict | Severity | Reconciliation |
|---|---|---|
| **GoF (anticipatory abstraction) vs. simple design / emergence** | Real | Arrive at patterns by refactoring *toward* them in response to demonstrated duplication/change — never design to them (Kerievsky; the existing rule-of-three). The module leads with it; "earn every abstraction" stays governing. |
| **DDD "anemic domain model is a smell" vs. Clean Code "no data/behavior hybrids"** | Apparent only | They *agree*. DDD's rich domain model *is* Clean Code's behavior-exposing object. No change. |
| **DDD aggregates/domain services vs. "minimal classes"** | Minor | The core-domain-only gate (subdomain tag) resolves it: structure is paid for only where essential complexity justifies it. |
| **TDD vs. Clean Code** | None | Same school. The root "Emergence" section is already Beck's four rules. |

**The single reconciliation lever:** the one arbitration line added to root
(A1). It pre-subordinates patterns and domain layers to simple design, so that
whenever the modules are composed in (design or implementation), they enter a
context that already demands justification.

## Resolved Decision Log

1.  **TDD is universal → root, both halves.** Workflow stated in root; the
    earlier project-level idea dropped.
2.  **Architecture is Option C (composition), not autonomous skills.** The
    guidance is pulled in by `project-spec` (design) and `project-orchestrate`
    (implementation), not surfaced mid-edit by the model. Harm-when-idle = zero.
3.  **GoF + DDD are reached through the orchestration skills**, not by broadening
    standalone descriptions. Two phases (design = name candidates; implement =
    refactor toward), one module each.
4.  **GoF names patterns in specs** (user override of the initial recommendation
    against it), bound by the candidate / justified / revisitable guardrail.
5.  **Strategic DDD folds into `project-spec`** — no separate strategic skill.
    Tactical DDD becomes the `domain-modeling` module.
6.  **GoF presents the faithful classic catalog**, not a modernized subset.
7.  **Module slugs:** `design-patterns` (GoF) and `domain-modeling` (tactical
    DDD). Intent-revealing, no acronym; source attribution lives in the body.
8.  **Core-vs-generic is classified once, at design time** (`project-spec`
    strategic pass → per-epic `subdomain` tag); `project-orchestrate` reads it
    and gates injection; default off when untagged.
9.  **Advisory at design, active at implementation** (core epics only), with
    active counterweighted by the root arbitration line.
10. **`_reference/` is git-ignored** (done) — the four source PDFs stay local and
    out of version control; citable while authoring.

## Open Questions

None remaining. All three prior open questions (slugs; trigger breadth;
advisory-vs-active) are resolved in the decision log above (items 7, 8, 9). The
trigger-breadth question dissolved with the Option-C pivot — there is no
autonomous trigger to tune; reach is governed by the orchestration skills' phase
and the `subdomain` gate.

## Out of Scope / Non-Goals

-   No sprint, epic-story breakdown, point estimates, or scaffold pipeline — this
    is a five-edit design record, not a GitHub-project body of work.
-   No TDD skill (see TDD rationale).
-   No modernized / curated GoF subset (faithful catalog).
-   No standalone strategic-DDD skill (folded into `project-spec`).
-   No autonomous mid-edit firing of the modules (Option C).
-   No edits to any `CLAUDE.md` or skill file as part of *this* document — only
    the spec is produced.

## Implementation Plan (five edits, no sprint)

1.  **Root `CLAUDE.md`** — add the arbitration line; confirm/complete the TDD
    workflow bullets; verify no duplicate TDD block.
2.  **`project-spec` skill** — add the strategic-DDD pass (incl. per-epic
    `subdomain` classification) and the GoF pattern-naming pass (with guardrail).
3.  **`project-orchestrate` skill** — read the `subdomain` tag; inject the two
    modules into core-epic subagents; default off when untagged; keep active mode
    counterweighted.
4.  **`design-patterns` module** (new) — counterweight-first, faithful 23-pattern
    body, with the A4 module-purpose description.
5.  **`domain-modeling` module** (new) — decision-oriented tactical body, with the
    A5 module-purpose description.

Sequence: edit 1 first (the arbitration line is the context everything else
relies on); edits 4–5 (the modules) before edits 2–3 (the parents that invoke
them); edits 2 and 3 are otherwise independent.

## Validation (how we will know it is right)

Because the artifacts are guidance, not runnable code, validation is behavioral:

-   **No idle load:** the modules never enter context outside a `project-spec` or
    `project-orchestrate` run.
-   **Gate works:** a `core`-tagged epic's implementing subagent receives the
    guidance; a `generic`/`supporting` epic's subagent does not; an untagged spec
    injects nothing.
-   **Design-time advisory:** a generated spec names patterns only in the
    candidate/justified/revisitable format and classifies subdomains.
-   **Active but counterweighted:** in a core epic, the subagent applies a flagged
    pattern only when the variation materialized, and otherwise implements the
    simplest sufficient code.

## Future Considerations

-   A thin **TDD small-steps coaching skill** if the model is later observed
    taking too-large steps.
-   Promotion of recurring tactical-DDD conventions from the module into a
    project's `CLAUDE.md` once a project formally adopts them.
-   Periodic check that the faithful GoF catalog's counterweight stays strong
    enough as model behavior evolves.
