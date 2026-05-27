# <Epic Name> — Shared Context

> Authored once per implementation epic by a `persona: research` subagent during the design-spike epic. Every implementation subagent for this epic reads this file in full before writing code. Sections below are required — keep them present even if briefly populated.

## Overview

<1–2 sentence summary of what this epic builds and how its stories fit together.>

Example: "Implements the authentication subsystem. Each story adds one piece — credential storage, session issuance, middleware, refresh flow — and they compose into a single auth pipeline consumed by every protected route."

## Naming Conventions

<Domain terms, prefixes, suffixes, casing rules specific to this epic. These override generic conventions in CLAUDE.md when in conflict.>

Example:
- All endpoint handler functions prefix with `handle_` (e.g., `handle_login`, `handle_refresh`)
- Event names use past tense (`UserCreated`, `SessionExpired` — never `CreateUser`, `ExpireSession`)
- Database column names use `snake_case`; corresponding TypeScript fields use `camelCase`
- Repository methods that return one row use singular nouns (`findUser`); those that return many use plural (`findUsers`)

## File Layout

<Where new files for this epic's stories live. Include full paths.>

Example:
- Repository implementations: `src/data/<entity>/postgres_<entity>_repository.ts`
- API controllers: `src/api/<entity>/<entity>_controller.ts`
- Domain types: `src/core/<entity>/types.ts`
- Tests colocated with source: `<file>.test.ts` next to `<file>.ts`
- Migrations: `migrations/NNNN_<description>.sql` (numbered sequentially)

## Shared Types & Interfaces

<Code blocks with type/interface/struct definitions stories must IMPORT rather than redefine. If two stories need the same type, define it here and reference the location.>

Example:

```typescript
// src/core/auth/types.ts
export type SessionId = string & { readonly __brand: "SessionId" };

export interface Credentials {
  email: string;
  password: string;
}

export interface Session {
  id: SessionId;
  userId: UserId;
  expiresAt: Date;
}
```

Stories MUST import these from the canonical location, not re-declare structurally identical types.

## Patterns to Follow

<Code-level patterns with concrete examples. Cover error handling, logging, pagination, validation, transaction boundaries, etc. Each pattern should include a one-line "why" so reviewers can judge edge cases.>

Example:

**Error handling at controller boundaries:**

```typescript
try {
  const result = await service.doThing(input);
  return ok(result);
} catch (e) {
  if (e instanceof DomainError) return badRequest(e.message);
  logger.error("unexpected", { e });
  return internalServerError();
}
```

Why: Domain errors are caller-visible; unknown errors must not leak internals.

**Pagination:** Cursor-based, never offset. Use `{ cursor, limit }` query params; return `{ items, nextCursor }`. Why: stable ordering across concurrent writes.

## Patterns to Avoid

<Anti-patterns specific to this epic with rationale. These are NOT a generic "best practices" list — they are concrete things that have caused problems or that violate the epic's design.>

Example:

- **Don't share a database client between modules.** Each repository constructs its own. Why: makes mocking and per-test isolation trivial.
- **Don't catch generic `Error` in middleware.** Catch specific subtypes only. Why: a broad catch swallows programmer errors that should crash loudly in dev.
- **Don't add new auth-related env vars without updating `src/config/env_schema.ts`.** Why: the schema is the validation layer — env vars not in it are silently undefined.

## External References

<Links to upstream docs, related ADRs, CLAUDE.md sections this epic depends on.>

- ADR: `<paths.adr>/NNNN-<slug>.md`
- CLAUDE.md sections: `Architecture`, `Code Quality`, `Testing`
- Upstream docs: `<url to library/framework docs if any>`
- Related epics: `<epic-slug>` (consumes the types defined here)
