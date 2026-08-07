# Engineering Baseline

> The universal engineering standard for all work this skill suite drives.
> `project-spec` reads it at design time; `project-orchestrate` reads it and
> **injects it into every subagent it spawns** at implementation time. It
> applies across the board, to every story and every file, regardless of domain.
>
> This is the **baseline layer**. The **situational layer** — Gang of Four
> design patterns (`design-patterns`) and tactical Domain-Driven Design
> (`domain-modeling`) — sits on top of it and is composed in only when the work
> warrants it (see each skill). When the situational layer fires, it remains
> **subordinate to the Arbitration Rule below**.

---

## The Arbitration Rule (read this first)

**Simple design is the default. Abstractions, design patterns, and domain layers
are responses to demonstrated complexity — duplication, repeated change in one
place, or essential domain rules — never anticipatory architecture. Arrive at
patterns by refactoring toward them, not by designing to them.**

Every pattern, every layer, every abstraction must justify itself against this
rule. Three similar lines beat a premature abstraction. When in doubt, write the
simplest thing that works and let duplication or change-pressure tell you when to
extract.

---

## Clean Code

### Naming
> Martin's standard: a good name answers the big questions — why the thing exists,
> what it does, and how it's used. If a name needs a comment to explain it, the
> name has failed.

- Names reveal intent. If a name needs a comment, the name is wrong.
- Class names are nouns; method names are verbs.
- One word per concept, used consistently across the codebase.
- Name length matches scope. Short names for short scopes; full descriptive
  names for wide ones.
- Don't encode type or scope into names (no Hungarian notation, no `m_`).
- Names describe side effects. A function that creates-if-absent is not a getter.

### Functions
> Martin's rules: functions should be small — and then smaller. Each should do one
> thing, do it well, and do it only.

- Small. One thing. One level of abstraction per function body.
- Stepdown rule: high-level functions first, helpers below — readable top to
  bottom like a newspaper.
- Minimize arguments. Zero–two normal, three suspect, more → pass an object.
- No flag (boolean) arguments — split into two functions.
- No hidden side effects. Command-query separation: change state or return a
  value, not both.
- Don't return null and don't pass null. Return an empty collection, an Optional,
  or throw.

### Comments
> Martin's view: a comment is a way of compensating for failing to express the
> intent in code. Prefer rewriting the code over explaining it with a comment.

- The best comment is the one made unnecessary by clear code.
- Delete commented-out code; version control remembers.
- A necessary comment explains **why**, not **what**.
- TODOs carry a ticket number or removal date.

### Formatting
- Related code stays vertically close; declare variables near first use.
- Keep lines readable without horizontal scrolling (~100 chars).
- Blank lines separate concepts; none between tightly coupled statements.
- Team/project formatting rules override personal preference.

### Objects and Data
- Objects hide data and expose behavior; data structures expose data and have no
  behavior. Don't make hybrids.
- Law of Demeter: don't reach through chains (`a.getB().getC().do()`).
- Prefer polymorphism over `switch`/`if-else` chains on type.

### Error Handling
> Martin's guidance: prefer exceptions over return codes for error signaling.

- Exceptions, not return codes. Write try-catch-finally first for fallible code.
- Provide context: what operation failed and what state was expected.
- Define exception types by how the caller handles them.

### Boundaries
- Wrap third-party APIs behind your own interfaces; don't let library types leak
  across module boundaries.

### Classes
- Single Responsibility: one reason to change.
- High cohesion: most methods use most fields.
- Open-Closed: extend without modifying working code.
- Dependency Inversion: depend on abstractions, not concretions.

### Smells — fix on sight
Dead code; commented-out code; functions with >3 arguments; magic
numbers/strings; base classes referencing derivatives; feature envy; inconsistent
conventions; hidden temporal coupling; artificial coupling; negative conditionals
(`!isNotReady()` → `isReady()`).

### The Boy Scout Rule
> The Boy Scout Rule (Martin, adapting the scouting maxim): always leave the code
> a little cleaner than you found it.

Leave every file cleaner than you found it. Every commit. No exceptions.

---

## Test-Driven Development

TDD is universal here — it governs how code comes into being, not just whether
tests exist.

### The discipline
- **Red → Green → Refactor** — Beck's rhythm. *Red:* write a small test that fails
  (it may not even compile yet). *Green:* make it pass as quickly as possible.
  *Refactor:* remove the duplication you created getting there. Always in that
  order — make it work, then make it clean.
- **Three laws** (Robert C. Martin's formulation of the same discipline): (1)
  write a failing test before production code; (2) write only enough test to fail;
  (3) write only enough production code to pass.
- **Small steps** — Beck's techniques. When a step is hard, take a smaller one:
  *Fake It* (return a constant) to get to green, then *Triangulate* to the real
  implementation.

### What good tests look like
- Tests describe behavior, not implementation. Test names are assertions
  ("computes pace when duration is edited"), not "test case 1".
- One concept per test (not necessarily one assert — one idea).
- **F.I.R.S.T.**: Fast, Independent, Repeatable, Self-validating, Timely.
- Test boundary conditions and cluster tests near known bugs.
- Tests are first-class code: clean, readable, well-named, colocated with source.

### Emergence (simple design, in priority order)
1. All tests pass. Untested code is unfinished code.
2. No duplication. Every piece of knowledge has one authoritative representation.
3. Code is expressive. The reader understands intent without asking the author.
4. Minimal classes and methods. Don't create abstractions you don't need yet.

---

## How this baseline is applied

- **`project-spec` (design time):** specs are written to satisfy this baseline.
  Acceptance criteria assume tests-first; designs assume the Arbitration Rule.
- **`project-orchestrate` (implementation time):** this document is injected,
  verbatim or by reference, into every implementation, review, and hardening
  subagent prompt. Subagents follow it in addition to the project's own
  `CLAUDE.md` (project rules win on direct conflict).
- **Order of precedence:** project `CLAUDE.md` > this baseline > situational
  guidance (`design-patterns`, `domain-modeling`). The situational layer never
  overrides the Arbitration Rule.
