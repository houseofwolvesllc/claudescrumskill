---
name: domain-modeling
description: >-
  Tactical Domain-Driven Design for modeling complex core domains — deciding
  where a business rule belongs, designing aggregate boundaries and their
  consistency rules, choosing between an entity and a value object, introducing
  domain events, and keeping code aligned with the domain's ubiquitous language.
  Used by project-spec (advisory, shaping the spec and classifying subdomains)
  and project-orchestrate (active, while implementing core-domain epics). Fires
  only for behavior-rich core-domain logic. STAYS DORMANT for CRUD, generic and
  supporting subdomains, technical plumbing, data pipelines, and simple
  persistence — per Evans's own scoping: tactical DDD is for the core domain's
  essential complexity, not generic subdomains.
---

# Domain Modeling (Tactical DDD)

The tactical building blocks from *Domain-Driven Design* (Eric Evans). This skill
is the **situational layer** — it composes on top of the Engineering Baseline and
never overrides it.

---

## Read this before modeling

**Apply this only to the complex core domain.** Evans's own thesis: tactical DDD
earns its structure where essential business complexity lives — not in generic or
supporting subdomains, and never in CRUD, plumbing, or simple persistence. For
those, the Engineering Baseline's Arbitration Rule governs: write the simplest
thing that works.

The `subdomain` classification (`core` / `supporting` / `generic`) is set once,
at design time, by `project-spec`. `project-orchestrate` reads it and applies
this guidance **only to `core` epics**. Do not re-derive the classification
downstream.

Subordinate every decision below to the **Arbitration Rule** in
`../shared/references/ENGINEERING_BASELINE.md`. Aggregates and domain services add
layers; pay for them only where invariants demand it.

---

## Ubiquitous language

Evans's idea: make the domain model the backbone of a shared language, and have
the whole team use that language relentlessly — in speech, writing, diagrams, and
the code itself.

In practice: name classes, methods, and modules after the terms stakeholders
actually use. When the code's language drifts from the conversation, the model is
wrong — fix the names, and often the design follows.

---

## Building blocks (decision-oriented)

### Entity vs. Value Object — choose deliberately
- **Entity** (Evans) — an object distinguished by its identity and life-cycle
  continuity rather than its attributes; keep its definition focused on identity
  and continuity over time. Use when the thing has a lifecycle and must be tracked
  (an `Order`, an `Account`).
- **Value Object** (Evans) — an object you care about only for its attributes;
  make it immutable, give it no identity, let it carry related behavior, and let
  its attributes form a single conceptual whole (`Money`, `DateRange`, `Address`).
  **Default to value objects** — they are simpler, safe to share, and push behavior
  to where the data lives. Reach for an entity only when identity genuinely matters.

### Where does a business rule live?
- A rule about a single concept belongs **on that entity or value object** (rich
  behavior, not an anemic data bag — this aligns with Clean Code's "objects
  expose behavior").
- A rule that spans several objects and belongs to none belongs in a **Domain
  Service** (Evans) — a stateless operation offered as a standalone interface in
  the model (unlike entities and value objects, it encapsulates no state). Name it
  in the ubiquitous language. Use sparingly; most logic belongs on the model.
- A rule that enforces consistency across a cluster belongs at the **aggregate
  root** (below).

### Aggregates
- Evans's idea: cluster related entities and value objects into an **aggregate**
  with a defined boundary, pick one entity as the **root**, and route all external
  access through it — outside objects may hold a reference only to the root.
- Because the root controls access, it can enforce every invariant of the aggregate
  on any state change.
- **Boundary heuristics:** keep aggregates small; one transaction modifies one
  aggregate; reference other aggregates by identity, not by holding the object;
  let cross-aggregate consistency be eventual.

### Repositories
- Evans's idea: for each type that needs global access, provide an object that acts
  like an in-memory collection of all objects of that type — with methods to add,
  remove, and select by criteria — while hiding the actual data store. One
  repository per aggregate root.
- Keep persistence concerns out of the domain; map rows to domain types behind
  the repository interface (depend on the abstraction, per the baseline).

### Factories
- Evans's idea: move creation of complex objects and aggregates into a dedicated
  object whose interface encapsulates the assembly and hides the concrete classes
  from the client. Use a factory to enforce invariants at creation; don't add one
  for simple construction — that's anticipatory abstraction.

### Domain Events
- **Note on provenance:** Domain Events are **not** a building block in Evans's
  original 2003 *Domain-Driven Design*. They were added later (Evans's 2014
  *Domain-Driven Design Reference*; popularized by Vernon's *Implementing DDD*).
  Treat them as a widely-adopted extension, not original Evans canon.
- A **Domain Event** captures something meaningful that happened in the domain,
  named in past tense (`OrderPlaced`, `PaymentCaptured`).
- Use to decouple aggregates and drive eventual consistency across boundaries —
  not as a generic message bus for every state change.

---

## How this composes with design-patterns

Tactical DDD answers *what the domain objects are and which invariants they hold*;
`design-patterns` answers *how to structure code-level variation*. They can meet
(a Factory appears in both vocabularies), but model the domain first — let the
behavior and invariants drive the shape, and reach for a GoF pattern only if a
demonstrated axis of variation then calls for one, per its own counterweight.
