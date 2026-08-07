# Engineering Baseline

> Injected into every story this suite drives. Clean Code and test-driven
> development are binding; this file states only what is project-specific.

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

## Emergence (simple design, in priority order)

1. All tests pass. Untested code is unfinished code.
2. No duplication. Every piece of knowledge has one authoritative representation.
3. Code is expressive. The reader understands intent without asking the author.
4. Minimal classes and methods. Don't create abstractions you don't need yet.

---

## Order of precedence

Project `CLAUDE.md` > this baseline > situational guidance (`design-patterns`,
`domain-modeling`). The situational layer never overrides the Arbitration Rule.
