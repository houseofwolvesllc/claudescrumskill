# Emulation Findings — Run 1 (Multi-Spec Sequential Orchestration)

Scope: validate the Phase 1 work (sequential multi-path mode + `depends_on` resolution + `--skip-on-pause` / `--merged` flags + queue state file) against the consumer workflows: invoking `/project-orchestrate` with multiple PRD paths, reading the new SKILL.md sections as a new user, reading the README invocation patterns table, executing per-spec orchestration through the new wrapper.

Project is a markdown skill suite — Phase 2 categories 1, 2, 4, 5, 6 from the emulation framework are N/A. Phase 3 categories all N/A. Phase 2 category 3 (Config Coverage) applies in a narrow sense (new flags vs documentation). Findings below come from cross-document consistency emulation: read each new section as a different consumer role and flag every place where two documents disagree, a reference dangles, or a control surface is ambiguous.

---

## 🔴 Critical

None.

The new functionality wires cleanly into the existing v1.7.1 single-spec orchestration. Multi-path mode is a wrapper that invokes the existing flow once per spec; all the integration seams (Mode Classification → Dependency Resolution → per-spec wrapper → state file archival → cumulative summary) have explicit handoffs.

---

## 🟡 Warning

### W1. Mode Classification table missing the "2+ tokens, all non-files" case

**Category:** Specification/Completeness
**Files:** `skills/project-orchestrate/SKILL.md` (Input Parsing and Mode Detection → Mode Classification)

The classification table covers 0 tokens, 1 token (file), 1 token (non-file), 2 tokens (one file one non-file), 2+ tokens (all files), and 2+ tokens (mixed). It does NOT address the case of **2+ tokens, all non-files** — e.g., `/project-orchestrate owner/repo-a owner/repo-b`. An executing agent would have no documented rule for this case.

**Likely interpretation under ambiguity:** agent picks the first arg and treats it as repo-identifier mode, ignoring the rest — or worse, attempts to handle both and fails partway.

**Recommendation:** Add a table row: "2+ tokens, all non-files → **ERROR.** Multi-repo invocation is unsupported. Abort with a message listing the repo identifiers and noting that exactly one repo identifier is permitted."

---

### W2. Flag/arg disambiguation not explicit before mode classification

**Category:** Specification/Order-Of-Operations
**Files:** `skills/project-orchestrate/SKILL.md` (Input Parsing and Mode Detection → Flag Parsing + Mode Classification)

The Flag Parsing subsection says "flags may appear in any position within `$ARGUMENTS`". The Mode Classification table counts "tokens" without explicitly stating that flags are stripped from the token count before classification. An executing agent could plausibly count `--skip-on-pause` as one of the "2+ tokens" and miscalibrate the classification — e.g., `/project-orchestrate --skip-on-pause spec.md` (single spec + one flag) could be misread as a 2-token invocation triggering some mode.

**Recommendation:** Add a "Pre-Classification Step" sentence at the top of Mode Classification: "Before applying the table below, separate flag tokens (those starting with `--`) from argument tokens. Count and classify only the argument tokens. Flags are validated separately by the Flag Parsing subsection."

---

## 🔵 Info

### I1. Token-count wording "2 + one file/one non-file" doesn't address 3+ token PRD+repo case

**Category:** Specification/Edge-Case
**Files:** `skills/project-orchestrate/SKILL.md` (Mode Classification table)

The PRD+repo row says "Token count 2 + exactly one is a file". A user invoking `/project-orchestrate spec.md owner/repo extra-thing` (3 tokens, one file, two non-files) is undefined. Probably should abort, but the table doesn't say.

**Recommendation:** Tighten the row to "Token count = 2 AND exactly one is a file" so it's unambiguous that 3+ tokens with this shape do not match. The "mixed argument" abort rule then catches it.

---

### I2. README example always shows `--merged` before args; SKILL.md says flags can appear anywhere

**Category:** Documentation/Style-Consistency
**Files:** `README.md` (Invocation Patterns), `skills/project-orchestrate/SKILL.md` (Flag Parsing)

The README invocation table shows `/project-orchestrate --merged spec-1.md spec-2.md` — flag first. The SKILL.md Flag Parsing subsection states "flags may appear in any position". Both are correct, but a user reading the README first might infer flag-first is required.

**Recommendation:** Add a one-line note under the README Invocation Patterns table: "Flags may appear before or after argument tokens; the table examples place them first by convention."

---

### I3. ADR-0002 placeholder — orchestration-time ADR not yet created

**Category:** Workflow/Self-Reference
**Files:** N/A (will exist at `docs/adrs/0002-*.md` after Step 16)

Step 16 of the orchestrate skill will create an ADR documenting the architectural decisions for this orchestration (multi-spec sequential mode, queue state file design, per-spec slug-suffixed archives). That ADR is not yet on disk because Step 16 runs after this emulation phase per the orchestrate flow. Listed here only for traceability — this is expected behavior, not a defect.

**Recommendation:** none — Step 16 will create it.

---

### I4. Dependency Resolution mentions "merged mode" interaction without elaboration

**Category:** Specification/Forward-Reference-Ambiguity
**Files:** `skills/project-orchestrate/SKILL.md` (Dependency Resolution intro)

The Dependency Resolution intro says: "Applies only to sequential multi-path mode (and merged mode if dependencies need to inform internal ordering)." The "if dependencies need to inform internal ordering" hedge is vague — merged mode is explicitly best-effort and its semantics are deferred. Either dependency resolution runs in merged mode or it doesn't.

**Recommendation:** Change to "Applies only to sequential multi-path mode. In merged mode, the legacy unified-multi-spec behavior is invoked instead and `depends_on` is not enforced (merged semantics, including dependency handling, are deferred to a follow-up spec)."

---

### I5. Queue state file Meta section doesn't include `--skip-on-pause` value when set

**Category:** Documentation/Completeness
**Files:** `skills/project-orchestrate/SKILL.md` (Sequential Multi-Path Mode → Queue State File)

The Queue State File template Meta section shows `**Flags:** --skip-on-pause=<true|false>, --merged=<true|false>`. The template is correct, but the surrounding prose doesn't emphasize that the Meta section is the canonical record of which flags were active for this run — useful for post-mortem when a run was paused and resumed. Minor.

**Recommendation:** Add a sentence: "The Meta section records the flags active at run start. Resume uses the recorded flags, not the flags on the resume invocation — preventing accidental flag changes mid-run."

---

## Coverage Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Discovery | Complete | Roles: 3 consumer roles (multi-path invoker, dependency declarer, queue-state reader). Actions: 8 (6 mode classifications + 2 flag combinations). |
| Phase 2: Integration Seams | Adapted | Categories 1, 2, 4, 5, 6 N/A (no Dockerfiles/transpilers/IoC/services/payloads). Category 3 (Config Coverage) verified — new flags documented in SKILL.md, CONVENTIONS.md, and README; new queue state file path consistent across SKILL.md sections. |
| Phase 3: Layer Contracts | N/A | No application layers. |
| Phase 4: Permutation Matrix | Implicit | 6 mode classes × 2 flag bools × N spec counts. Mode Detection section covers all 6 classes plus the error case. |
| Phase 5: Walkthrough | Documentation-based | Read each new section as each consumer role; flag cross-section inconsistencies. |
| Phase 6: Coverage Report | This file | |

## Findings Count

- 🔴 Critical: 0
- 🟡 Warning: 2
- 🔵 Info: 5

All warnings are specification clarity issues, not behavioral defects. Two targeted edits to `skills/project-orchestrate/SKILL.md` (Mode Classification table row + Flag/arg disambiguation sentence) resolve both warnings. Info findings can be addressed during normal future maintenance.
