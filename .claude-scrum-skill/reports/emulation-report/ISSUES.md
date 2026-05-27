# Emulation Findings — Run 1

Scope: validate the Phase 1 work (two-pass scaffolding + design-spike epic + orchestrate integration + documentation) against the consumer workflows: scaffolding a small PRD, scaffolding a large PRD, executing stories that consume CONTEXT.md, and reading the README as a new user.

The project is a markdown skill suite — no Dockerfiles, transpilers, IoC containers, or service-to-service payloads. Phase 2 categories 1, 2, 4, 5, and 6 from the emulation framework are N/A. Phase 2 category 3 (Configuration File Coverage) applies in a narrow sense (config keys vs documentation). Phase 3 categories are all N/A. The findings below come from cross-document consistency emulation: read each document as a different consumer role and flag every place where two documents disagree, a reference dangles, or a control surface is ambiguous.

---

## 🔴 Critical

None.

The new functionality wires into the existing skills without introducing any break in the documented control flow. The integration seams (Mode Detection → per-backend procedure, design-spike injection → implementation epic gating, orchestrate Step 3 → CONTEXT.md read) all have explicit handoffs.

---

## 🟡 Warning

### W1. Trigger precedence contradicts between Input section and Mode Detection section

**Category:** Documentation/Internal-Consistency
**Files:** `skills/project-scaffold/SKILL.md`

The "Input → CLI Flags" subsection (line 59) states:

> Trigger precedence (highest first): CLI flag → PRD frontmatter → config / heuristic.

The "Mode Detection → Trigger Evaluation" subsection (lines 72-85) lists triggers in this order with the rule "first match wins":

1. PRD frontmatter override
2. CLI flag
3. Word count heuristic

These contradict. Under "first match wins" with frontmatter at position 1, frontmatter would win over a CLI flag. But the Input section explicitly says CLI flag is highest priority.

A user setting `scaffold_mode: single-pass` in frontmatter and then passing `--mode two-pass` on the command line gets unpredictable behavior depending on which section the executing agent followed.

**Impact:** Ambiguous control surface — the documented precedence is contradictory. Different invocations of the same scaffold against the same inputs could produce different modes.

**Recommendation:** Pick one ordering (CLI flag highest is the more conventional choice — CLI is a deliberate per-invocation override of frontmatter defaults) and update both sections to match. The "Trigger Evaluation" list should be re-ordered so the highest-precedence trigger appears first.

---

### W2. Same trigger precedence contradiction in Design-Spike Epic section

**Category:** Documentation/Internal-Consistency
**Files:** `skills/project-scaffold/SKILL.md`

The Design-Spike Epic "Trigger Evaluation" subsection (lines 252-269) has the identical contradiction with the Input section's precedence statement. Frontmatter is listed at position 1 (first match wins → frontmatter wins) but the Input section says CLI flag should win.

**Impact:** Same as W1, applied to the `design_spike` control rather than `scaffold_mode`.

**Recommendation:** Same fix as W1 — re-order both Trigger Evaluation lists so the canonical precedence (CLI flag highest, frontmatter second, config/heuristic third) matches the Input section's statement.

---

### W3. "Persona label" terminology in Pass 2 elaboration spec is GitHub-mode-specific

**Category:** Cross-Backend-Consistency
**Files:** `skills/project-scaffold/SKILL.md` (Two-Pass Procedure → Pass 2 — Per-Epic Elaboration)

Line 184 lists what each Pass 2 subagent produces, including:

> - Persona label

In GitHub mode, persona is a label (e.g., `persona:research`). In local mode, persona is a frontmatter field (`persona: research`). In Jira and Trello modes, it's also a label-like field. The phrasing "Persona label" reads as GitHub-mode-only and could lead a local-mode Pass 2 subagent to write a literal `labels: [..., persona:research]` entry into frontmatter instead of `persona: research`.

**Impact:** A Pass 2 subagent operating in local mode that follows the wording literally may produce malformed story frontmatter that downstream `/sprint-plan` and `/project-orchestrate` skills don't recognize. The persona routing logic in `project-orchestrate/SKILL.md` (lines 222-223) explicitly differentiates: "GitHub mode: Check the story's labels for a `persona:*` label. Local mode: Read the `persona` field from the story file's frontmatter."

**Recommendation:** Change "Persona label" to "Persona designation (label in GitHub/Trello/Jira modes; `persona` frontmatter field in local mode — see CONVENTIONS.md and PERSONAS.md)".

---

### W4. CLI flags presume a formal argument parser that does not exist

**Category:** Implementation/Reality-Gap
**Files:** `skills/project-scaffold/SKILL.md` (Input → CLI Flags; Mode Detection; Design-Spike Epic)

The documentation introduces `--mode single-pass | two-pass` and `--design-spike | --no-design-spike` CLI flags as a trigger source. But Claude Code skills are invoked via a free-text `$ARGUMENTS` string; there is no formal CLI parser that extracts flags. The "flags" are aspirational — they only work if the executing agent recognizes them in the argument string.

This may surprise users who pass the flags expecting consistent behavior, and may inconsistently apply across runs depending on how the executing agent interprets the args.

**Impact:** Aspirational documented behavior may not be reliably realized. Users may assume a hard contract where there's only a convention.

**Recommendation:** Either (a) add explicit guidance in the CLI Flags section that the executing agent must scan `$ARGUMENTS` for these strings and treat them as overrides; or (b) remove the CLI flag mechanism and rely solely on PRD frontmatter + config + word-count heuristic. Option (a) preserves the user-facing affordance with a clarifying note; option (b) simplifies but loses per-invocation override.

---

## 🔵 Info

### I1. Step 16 ADR numbering doesn't specify empty-set behavior

**Category:** Edge-Case/Documentation-Completeness
**Files:** `skills/project-orchestrate/SKILL.md` (Step 16 — ADR Update)

The instruction "Compute the next sequential ADR number as `max(existing_numbers) + 1`" doesn't handle the case where no ADRs exist (empty `<paths.adr>` directory or directory does not exist). `max()` on an empty set is undefined.

**Recommendation:** Add "If no ADRs exist yet, start at `0001`." The first design-spike ADR on a fresh project hits this case immediately.

---

### I2. Auto-injected Technical Context reference uses bracket syntax without URLs

**Category:** Documentation/Output-Format
**Files:** `skills/project-scaffold/SKILL.md` (Design-Spike Epic → Auto-Injection of References)

The auto-injected line is documented as:

> See [<paths.context>/<epic-slug>/CONTEXT.md] and [<paths.adr>/NNNN-<slug>.md] for shared architectural decisions.

The `[...]` notation looks like markdown link syntax with a missing URL, which markdown renderers display as the bracketed text but without a link affordance. If the intent is paths-as-text, backticks would be clearer (`` `<paths.context>/<epic-slug>/CONTEXT.md` ``). If the intent is proper relative links, the form should be `[CONTEXT.md](<paths.context>/<epic-slug>/CONTEXT.md)`.

**Recommendation:** Switch to backticks for the auto-injected reference — it's intended as a path reference for the implementing subagent to act on, not a clickable link.

---

### I3. Idempotency Check local-mode glob uses bracket notation that reads as optional

**Category:** Documentation/Clarity
**Files:** `skills/project-scaffold/SKILL.md` (Design-Spike Epic → Idempotency Check, local mode)

> Scan `<paths.backlog>/*/[_]epic.md` frontmatter for `epic_type: design-spike`.

The `[_]` reads as a regex/glob character class meaning "optional underscore". The actual filename is `_epic.md` (no optional underscore). The bracket notation is misleading and a literal interpretation would scan both `epic.md` and `_epic.md` — only the latter exists.

**Recommendation:** Change to `<paths.backlog>/*/_epic.md`.

---

### I4. Auto-Injection of References describes a step that lives in a different section

**Category:** Documentation/Structure
**Files:** `skills/project-scaffold/SKILL.md`

The "Auto-Injection of References" subsection lives inside the Design-Spike Epic section but says the injection "happens during Story Assembly, after Pass 2 produces stories but before per-backend creation runs." Story Assembly is a step inside the Two-Pass Procedure section (a different section earlier in the document). A reader following the document linearly has to jump back to understand where the injection actually fires.

**Recommendation:** Add a cross-reference note inside the Two-Pass Procedure → Story Assembly section: "If the design-spike epic is part of this scaffold (see Design-Spike Epic below), assembly also auto-injects a Technical Context reference into every implementation story — see Design-Spike Epic → Auto-Injection of References."

---

### I5. CONVENTIONS.md uses bare `shared/templates/` path reference

**Category:** Documentation/Path-Clarity
**Files:** `skills/shared/references/CONVENTIONS.md` (Design-Spike Epic subsection)

The design-spike subsection references the template at `skills/shared/templates/CONTEXT-template.md`. From the CONVENTIONS.md file's perspective, the relative path is `../templates/CONTEXT-template.md`. Other references in this file use `..` relative paths (e.g., `../shared/config.json` in SKILL.md files), so the bare reference is inconsistent with surrounding style.

**Impact:** Low — the path is unambiguous within the repository context, but inconsistent with how other shared references are written.

**Recommendation:** Either keep as-is (project-root-relative is also a valid reading) or normalize to `../templates/CONTEXT-template.md`.

---

### I6. Pass 2 failure stub stories are under-specified

**Category:** Failure-Handling/Behavior-Definition
**Files:** `skills/project-scaffold/SKILL.md` (Two-Pass Procedure → Failure Handling, Pass 2 subagent failure)

The instruction "Generate placeholder stories for the affected epic with `status: needs-context` and a note explaining the Pass 2 failure" doesn't specify how many placeholder stories, what their titles should be, or what point/executor/persona values to use. Two different executing agents recovering from the same failure could produce structurally different stubs.

**Impact:** Recovery state is non-deterministic; user inspection of a degraded scaffold gives different shapes depending on which agent ran the recovery.

**Recommendation:** Add specifics: "Generate exactly one placeholder story per epic with title `Needs Pass 2 elaboration: <epic-name>`, `points: 0`, `executor: human`, and a body section explaining the failure. The user re-runs scaffold or hand-completes after triage."

---

### I7. Documented `--mode` flag is ambiguous on absence

**Category:** Documentation/Edge-Case
**Files:** `skills/project-scaffold/SKILL.md` (Input → CLI Flags)

The flag is documented as `--mode single-pass | two-pass` (one value required). The documentation doesn't say what happens if the user passes `--mode` with no value, or with an invalid value (e.g., `--mode three-pass`). Reasonable behavior: ignore invalid flags and fall through to next trigger source; this should be stated.

**Recommendation:** Add a sentence to the CLI Flags section: "Invalid or empty `--mode` / `--design-spike` values are ignored, and the next trigger source in precedence applies."

---

## Coverage Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Discovery | Complete | Roles: 4 consumer roles. Actions: 6 documented invocation paths (scaffold × 4 backends + orchestrate + sprint-plan). |
| Phase 2: Integration Seams | Adapted | Categories 1, 2, 4, 5, 6 N/A (no Dockerfiles/transpilers/IoC/services/payloads). Category 3 (Config Coverage) verified — all new config keys documented in both SKILL.md "Before You Start" and README. |
| Phase 3: Layer Contracts | N/A | No application layers. |
| Phase 4: Permutation Matrix | Implicit | 4 backends × 2 modes × 2 design-spike states = 16 conceptual scenarios. Two-Pass + Design-Spike sections describe handoff for all 16. |
| Phase 5: Walkthrough | Documentation-based | Read each new section as each consumer role; flag cross-section inconsistencies. |
| Phase 6: Coverage Report | This file | |

## Findings Count

- 🔴 Critical: 0
- 🟡 Warning: 4
- 🔵 Info: 7

All warnings are documentation-consistency issues, not behavioral defects. They are actionable in a single hardening pass — a few targeted edits to project-scaffold/SKILL.md plus one to project-orchestrate/SKILL.md.
