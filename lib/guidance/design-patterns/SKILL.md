---
name: design-patterns
description: >-
  Faithful Gang of Four design-pattern catalog for complex core-domain design.
  Used by project-spec (to name candidate patterns against real axes of
  variation) and project-orchestrate (to refactor toward a named pattern while
  implementing core-domain epics). Surfaces on a specific, demonstrated design
  problem — conditional/switch logic on a type spreading across call sites, a
  need for runtime-substitutable behavior, adding variants without modifying
  existing classes, an object that must notify dependents, or a deliberate
  extension point — or when a pattern is named explicitly. NOT for CRUD,
  scripts, glue code, one-off transforms, or routine feature work; for those,
  prefer the simplest thing that works.
---

# Design Patterns (Gang of Four)

The classic catalog from *Design Patterns: Elements of Reusable Object-Oriented
Software* (Gamma, Helm, Johnson, Vlissides). This skill is the **situational
layer** — it composes on top of the Engineering Baseline and never overrides it.

---

## Read this before reaching for any pattern

**You almost certainly do not need a pattern.** Patterns are a destination you
**refactor toward** once a smell proves you need the flexibility — not a design
you start from. This is the discipline of *Refactoring to Patterns* (Kerievsky),
and it is the only safe way to use this catalog.

Subordinate every entry below to the **Arbitration Rule** in
`../shared/references/ENGINEERING_BASELINE.md`:

> Simple design is the default. Abstractions and patterns are responses to
> demonstrated complexity — never anticipatory architecture.

Guardrails:

- **Prefer the simplest thing that works.** Three similar lines beat a premature
  abstraction. A function, a closure, a map, or a plain conditional usually wins.
- **Apply the rule of three.** Don't introduce a pattern for one or two cases.
  Wait until duplication or repeated change in the same place demands it.
- **Patterns are a vocabulary, not a checklist.** Naming the pattern you arrived
  at aids communication; hunting for a pattern to apply causes over-engineering.
- **A named pattern can always collapse back.** If the variation it anticipated
  never materializes, refactor it away.

### Two modes (set by the calling skill)
- **Design time (`project-spec`):** name a *candidate* pattern for an identified
  axis of variation. Always in the form
  `Pattern — because <real axis of variation>; revisit at build (may collapse to
  a simpler form if the variation does not materialize)`. Candidate, justified,
  revisitable — never binding.
- **Implementation time (`project-orchestrate`, core epics only):** refactor
  *toward* a candidate pattern only once the variation it anticipated has
  actually appeared in the code. Otherwise implement the simplest sufficient
  thing and leave the pattern unbuilt.

---

## The 23 patterns

Each entry describes the pattern's intent in plain terms; the *reach for it* line
is practical guidance for when a demonstrated smell justifies it. For the canonical
treatment — motivation, structure, participants, and sample code — consult the book
itself (cited under Acknowledgments).

### Creational — how objects get made

- **Abstract Factory** — create whole families of related or dependent objects
  through one interface, without binding code to their concrete classes. Reach for
  it when the system must stay independent of how a product *family* is produced.
- **Builder** — separate the construction of a complex object from its
  representation, so one construction process can yield different representations.
  Reach for it for multi-step assembly or many optional parts.
- **Factory Method** — define a creation interface but let subclasses choose which
  class to instantiate, deferring instantiation to them.
- **Prototype** — produce new objects by copying a prototypical instance rather
  than instantiating classes directly. Reach for it when instantiation is costly or
  types are chosen at runtime.
- **Singleton** — guarantee a single instance with one global access point. Use
  sparingly — global mutable state, often an anti-pattern; prefer dependency
  injection.

### Structural — how objects compose

- **Adapter** — convert a class's interface into the one clients expect, letting
  otherwise-incompatible interfaces work together. Typically at a boundary.
- **Bridge** — decouple an abstraction from its implementation so the two can vary
  independently. Reach for it to avoid a combinatorial subclass explosion.
- **Composite** — arrange objects into tree structures for part-whole hierarchies,
  letting clients treat individual objects and compositions uniformly.
- **Decorator** — attach responsibilities to an object dynamically — a flexible
  alternative to subclassing for extending behavior.
- **Facade** — offer a single higher-level interface to a subsystem, making it
  easier to use and decoupling clients from its internals.
- **Flyweight** — share fine-grained objects to support large numbers of them
  efficiently. Reach for it when many objects share intrinsic state.
- **Proxy** — stand in for another object to control access to it (lazy loading,
  access control, remoting, caching).

### Behavioral — how objects interact and distribute responsibility

- **Chain of Responsibility** — give several objects a chance to handle a request
  by passing it along a chain until one handles it, decoupling sender from receiver.
- **Command** — encapsulate a request as an object, enabling parameterization,
  queuing, logging, and undo.
- **Interpreter** — represent a grammar and an interpreter that evaluates sentences
  in that language. Reach for it only for simple, well-understood grammars.
- **Iterator** — traverse the elements of an aggregate sequentially without
  exposing its underlying representation. Usually built into the language.
- **Mediator** — encapsulate how a set of objects interact in a mediator object,
  promoting loose coupling by removing their direct references to each other.
- **Memento** — capture and externalize an object's internal state without breaking
  encapsulation, so it can be restored later. Reach for it for undo/checkpoint.
- **Observer** — establish a one-to-many dependency so that when one object changes
  state, its dependents are notified and updated automatically.
- **State** — let an object change its behavior when its internal state changes, as
  if it changed class. Reach for it to replace sprawling state conditionals.
- **Strategy** — encapsulate a family of interchangeable algorithms behind a common
  interface so the algorithm can vary independently of the clients that use it.
- **Template Method** — define the skeleton of an algorithm and defer some steps to
  subclasses, which can redefine those steps without changing the structure.
- **Visitor** — represent an operation to perform on the elements of an object
  structure, letting you add new operations without modifying those elements.

---

These intents are paraphrased descriptions of the patterns from *Design Patterns:
Elements of Reusable Object-Oriented Software* (Gamma, Helm, Johnson, Vlissides);
the catalog is credited under Acknowledgments. Selecting among these patterns — and
resisting them when the simplest thing suffices — is governed by the counterweight
above and the Engineering Baseline's Arbitration Rule.
