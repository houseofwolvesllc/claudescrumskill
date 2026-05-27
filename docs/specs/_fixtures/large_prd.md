---
title: Collaborative Notebook
scaffold_mode: two-pass
---

# Collaborative Notebook

## Overview

A multi-user, real-time collaborative notebook application. Users author rich-text notes, organize them into notebooks, share notebooks with collaborators at fine-grained permission levels, and see each other's edits live. The application is delivered as a single-page web app backed by a Node.js API and a Postgres database, with a Redis-backed pub/sub channel powering the real-time layer.

This PRD exists as a verification fixture for the scaffolding skill's two-pass mode and the auto-injected design-spike epic. It is intentionally large (>5000 words), multi-epic (4 implementation epics), and articulates explicit cross-cutting concerns — shared identifier types, a uniform event envelope, a single error response shape — so the design-spike epic has concrete material to lift into the foundational ADR and per-epic CONTEXT.md files.

## Glossary

- **Account** — A registered user of the application, identified by an `AccountId` (UUID v4).
- **Notebook** — A named container for an ordered list of notes, identified by a `NotebookId` (UUID v4).
- **Note** — A single rich-text document inside a notebook, identified by a `NoteId` (UUID v4).
- **Collaborator** — An account granted permission on a notebook by its owner. Permission levels: `viewer`, `editor`, `admin`.
- **Sync event** — A structured message published to a notebook's Redis channel describing a state change (note created, note edited, collaborator added, etc.).
- **Session** — An authenticated browser tab connected to the API, identified by a `SessionId` (opaque token).

## Cross-Cutting Concerns

These apply to all epics. The design-spike epic should lift them into the foundational ADR and the per-epic `CONTEXT.md` files.

### Identifier Types

All IDs are branded TypeScript types over `string` (not raw strings). Defined once in `src/core/ids/types.ts` and imported wherever consumed:

```typescript
export type AccountId = string & { readonly __brand: "AccountId" };
export type NotebookId = string & { readonly __brand: "NotebookId" };
export type NoteId = string & { readonly __brand: "NoteId" };
export type SessionId = string & { readonly __brand: "SessionId" };
```

No epic redefines these. New ID types added in future epics follow the same pattern.

### Sync Event Envelope

Every event published over the real-time layer uses this envelope:

```typescript
interface SyncEvent<T> {
  id: string;             // event id, ULID, monotonically sortable
  notebookId: NotebookId; // routing key
  actorId: AccountId;     // who caused it
  occurredAt: string;     // ISO 8601 UTC
  type: string;           // e.g., "NoteCreated", "CollaboratorAdded"
  payload: T;             // type-specific body
}
```

Event types are past tense (`NoteCreated`, never `CreateNote`). Naming and routing are defined in the Real-time Sync Backbone epic; consumer epics (Collaboration UI, Permissions & Sharing) consume the envelope without modifying its shape.

### Error Response Shape

Every API error response uses this shape:

```json
{
  "error": {
    "code": "NOTEBOOK_NOT_FOUND",
    "message": "Notebook abc-123 does not exist or is not visible to you.",
    "fields": { "notebookId": "abc-123" }
  }
}
```

`code` is a SCREAMING_SNAKE constant unique across the application. `fields` is optional but expected for validation errors. Each epic's stories MUST register their error codes in the central `src/core/errors/codes.ts` registry — duplicates fail CI.

### File Layout

- Domain types: `src/core/<domain>/types.ts`
- Domain logic (pure): `src/core/<domain>/*.ts`
- Repository interfaces: `src/data/<domain>/_<domain>_repository.ts`
- Repository implementations: `src/data/<domain>/postgres_<domain>_repository.ts`
- API controllers: `src/api/<domain>/<domain>_controller.ts`
- Real-time handlers: `src/realtime/<domain>/<domain>_publisher.ts`
- Frontend feature modules: `web/src/features/<domain>/`

This layout is uniform across epics. Stories that introduce a new domain MUST follow it.

### Non-Functional Requirements

- API p99 latency under 200 ms for read endpoints, under 500 ms for write endpoints, measured over a 5-minute rolling window.
- Real-time event delivery from publisher to subscriber under 250 ms in steady state.
- All API endpoints require an authenticated session except `/healthz`, `/api/v1/sessions` (login), and `/api/v1/accounts` (registration).
- All database queries scope to the caller's `AccountId` either directly or through a notebook-permission join — no global queries.
- All writes use a transaction; reads can use a read-only connection where available.

## Epic 1: Authentication & Identity

### Overview

Establish the account, session, and authentication primitives every other epic depends on. The output of this epic is a working signup, login, logout, and session-refresh flow with secure cookie handling and password storage.

### Stories

#### Story 1.1: Account registration endpoint

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- `POST /api/v1/accounts` accepts `{ email, password, displayName }`.
- Email is validated against an RFC-5321-compatible regex; password must be ≥ 12 chars with at least one digit and one non-alphanumeric.
- Password is hashed with Argon2id (memory 64 MiB, iterations 3) before storage.
- On success, returns `201 Created` with the new `AccountId` and a `Set-Cookie` header issuing a fresh session.
- Conflicting email returns `409` with code `ACCOUNT_EMAIL_TAKEN`.
- Validation failures return `400` with a structured `fields` object naming the failing fields.

#### Story 1.2: Login endpoint

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- `POST /api/v1/sessions` accepts `{ email, password }`.
- On success, sets an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie and returns `200 OK` with the account profile.
- On invalid credentials, returns `401` with code `SESSION_INVALID_CREDENTIALS` (do not leak whether the email exists).
- Rate-limited to 10 attempts per IP per 5 minutes; over the limit returns `429` with code `RATE_LIMITED`.

#### Story 1.3: Logout endpoint

**Priority:** P1-high
**Executor:** claude
**Story Points:** 2

**Acceptance Criteria:**
- `DELETE /api/v1/sessions/current` invalidates the session in the store and clears the cookie.
- Returns `204 No Content` on success; idempotent (logging out an already-invalid session also returns `204`).

#### Story 1.4: Session refresh middleware

**Priority:** P1-high
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- Sessions have a sliding expiry: every authenticated request extends the session by 24 hours, capped at an absolute 30-day maximum.
- When the session would extend, a new cookie is issued in the response.
- Expired or missing sessions on protected routes return `401` with code `SESSION_EXPIRED` (vs `SESSION_REQUIRED` for missing).

#### Story 1.5: Account profile endpoints

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- `GET /api/v1/accounts/me` returns the current account.
- `PATCH /api/v1/accounts/me` accepts `{ displayName?, password? }`. Password change requires the current password in a `currentPassword` field.
- Display name length 1–80; characters allowed: any printable Unicode except newline.

#### Story 1.6: Auth integration tests

**Priority:** P1-high
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- End-to-end tests cover the full signup → login → refresh → logout flow against a real test database (no auth mocks).
- Test coverage includes rate-limit triggering, session expiry, and password change invalidating other sessions.

## Epic 2: Real-time Sync Backbone

### Overview

The publish/subscribe infrastructure that delivers sync events from the API to connected browser tabs in under 250 ms. Other epics emit events through this layer; the UI epic consumes them.

### Stories

#### Story 2.1: Event envelope and registry

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- The `SyncEvent<T>` envelope type is defined in `src/core/events/types.ts` exactly as described in Cross-Cutting Concerns.
- A central `EventRegistry` maps event type strings to their payload types, enforcing that no two registrations share a type string.
- ULID library used: `ulid` (no alternatives — pin in `package.json`).

#### Story 2.2: Redis publisher abstraction

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- `_EventPublisher` interface in `src/realtime/_event_publisher.ts` with a single method `publish<T>(event: SyncEvent<T>): Promise<void>`.
- `Redis_EventPublisher` implementation publishes to channel `notebook:<notebookId>` as JSON.
- On Redis connection failure, the publisher logs the failure and surfaces it to the caller as a `RealtimePublishError` — the caller decides whether to retry or fail the request.
- Integration test publishes an event and verifies the message arrives on the corresponding channel via a separate subscriber.

#### Story 2.3: WebSocket gateway

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 8

**Acceptance Criteria:**
- `GET /api/v1/realtime` upgrades to a WebSocket connection.
- The connection requires an authenticated session.
- After upgrade, the client sends `{ subscribe: NotebookId[] }` messages to subscribe to notebook channels.
- Subscriptions are enforced against the caller's permissions (only notebooks the user can `viewer` or higher).
- Server pushes received events as JSON envelopes; client can send `{ unsubscribe: NotebookId[] }`.
- Idle connections are pinged every 30 seconds; missed pong responses close the connection.

#### Story 2.4: Sync event types — notebook scope

**Priority:** P1-high
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- Defines event types: `NotebookCreated`, `NotebookRenamed`, `NotebookDeleted`, `NoteCreated`, `NoteEdited`, `NoteReordered`, `NoteDeleted`. Each registered in the EventRegistry.
- Payload types live alongside their event names in `src/core/events/notebook_events.ts`.
- Each event type has a documented "Who emits this" comment and example payload.

#### Story 2.5: Sync delivery latency test

**Priority:** P1-high
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- A test harness publishes 1,000 events and measures end-to-end delivery time from publish to subscriber receipt.
- p99 latency under 250 ms is the pass threshold; failure under that threshold fails CI.
- Test runs against a real local Redis (not a mock).

## Epic 3: Collaboration UI

### Overview

The frontend feature module for editing notes collaboratively. Renders the notebook tree, opens notes in a rich-text editor, subscribes to sync events, and merges remote edits into the local document.

### Stories

#### Story 3.1: Notebook tree view

**Priority:** P1-high
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- Left sidebar lists all notebooks the current user has access to, with permission badge (V / E / A).
- Each notebook expands to show its notes in their stored order.
- Drag-to-reorder publishes a `NoteReordered` event after a server confirmation.
- Active note is highlighted; clicking a note opens it in the main editor pane.

#### Story 3.2: Rich-text editor

**Priority:** P1-high
**Executor:** claude
**Story Points:** 8

**Acceptance Criteria:**
- Editor is built on the existing `RichTextEditor` component (no new editor library).
- Local edits debounce at 500 ms before publishing a `NoteEdited` event.
- The editor accepts a `readOnly` prop bound to whether the user has `viewer`-only access.
- Conflict resolution: incoming `NoteEdited` events from other users apply if the local document version matches the event's base version, otherwise the document is replaced and a toast warns about the overwrite.

#### Story 3.3: Live cursor presence

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- Each collaborator's cursor position is rendered in the editor with their display name above it.
- Cursor positions are published every 100 ms (throttled).
- Disconnected cursors fade out after 5 seconds.

#### Story 3.4: Toast notifications for remote edits

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 2

**Acceptance Criteria:**
- When another user creates, renames, or deletes a notebook the current user can see, a toast appears in the corner with the user's display name and the action.
- Toasts persist for 4 seconds; clicking a toast navigates to the affected notebook/note.

#### Story 3.5: Reconnection handling

**Priority:** P1-high
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- WebSocket disconnects trigger an exponential-backoff reconnection (250 ms, 500 ms, 1 s, 2 s, 4 s, max 10 s).
- On reconnect, the client re-subscribes to its previously-subscribed notebooks and fetches the latest snapshot of any open note.
- A "Reconnecting…" banner is shown while disconnected; cleared on successful reconnect.

## Epic 4: Permissions & Sharing

### Overview

Notebook owners can invite collaborators by email at three permission levels: viewer (read-only), editor (read + write), admin (read + write + manage collaborators). Permission changes propagate via sync events.

### Stories

#### Story 4.1: Collaborator data model

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- New table `notebook_collaborators(notebook_id, account_id, level, granted_by, granted_at)` with a composite primary key on `(notebook_id, account_id)`.
- Domain type `Collaborator` in `src/core/collaborators/types.ts`; permission level is an enum `viewer | editor | admin`.
- Repository methods: `listByNotebook(notebookId)`, `findByPair(notebookId, accountId)`, `grant(notebookId, accountId, level, grantedBy)`, `revoke(notebookId, accountId)`.

#### Story 4.2: Permission middleware

**Priority:** P0-critical
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- Middleware function `requirePermission(notebookIdParam: string, minLevel: PermissionLevel)` rejects requests where the caller's permission on the notebook is below the minimum.
- The owner of a notebook implicitly has `admin` permission, even without a row in `notebook_collaborators`.
- Rejection returns `403` with code `PERMISSION_INSUFFICIENT` and a `fields.required` indicating the minimum required level.

#### Story 4.3: Collaborator management endpoints

**Priority:** P1-high
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- `GET /api/v1/notebooks/:notebookId/collaborators` lists collaborators (requires `editor`+).
- `POST /api/v1/notebooks/:notebookId/collaborators` adds a collaborator by email (requires `admin`). If the email does not match any account, returns `404` with code `ACCOUNT_NOT_FOUND` (do not auto-invite).
- `PATCH /api/v1/notebooks/:notebookId/collaborators/:accountId` updates the permission level (requires `admin`).
- `DELETE /api/v1/notebooks/:notebookId/collaborators/:accountId` revokes (requires `admin`).
- Every successful write publishes a `CollaboratorAdded`, `CollaboratorUpdated`, or `CollaboratorRevoked` sync event.

#### Story 4.4: Collaborator sync event types

**Priority:** P1-high
**Executor:** claude
**Story Points:** 2

**Acceptance Criteria:**
- Event types `CollaboratorAdded`, `CollaboratorUpdated`, `CollaboratorRevoked` registered in the EventRegistry.
- Payload includes the affected account's `AccountId` and `displayName` plus the new permission level (or `null` on revoke).
- The WebSocket gateway broadcasts these to subscribers of the affected notebook so UI updates instantly.

#### Story 4.5: Permissions UI

**Priority:** P1-high
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- Notebook settings panel includes a "Collaborators" tab showing the current list.
- Admins see an "Add Collaborator" form (email + permission level dropdown), a per-row permission dropdown, and a revoke button.
- Editors and viewers see the list but no controls.
- Permission changes apply optimistically; failures revert the UI and show a toast.

#### Story 4.6: Audit log

**Priority:** P3-low
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- All permission changes are written to an append-only `permission_audit_log` table.
- A new `GET /api/v1/notebooks/:notebookId/audit-log` endpoint (admin-only) returns the log for a notebook, paginated.
- UI for browsing the audit log is out of scope for this epic — surface as a follow-up.

## Architecture

The application is composed of four layers that map onto the file-layout convention defined in Cross-Cutting Concerns. Each layer has a single responsibility and depends only on layers below it via abstractions.

### Layer 1: Core (Domain)

Pure TypeScript modules under `src/core/`. No I/O, no framework dependencies, no third-party libraries beyond utility helpers (e.g., `ulid`, `zod`). Defines:

- Identifier types (branded `string` types as described above).
- Domain entities (`Account`, `Notebook`, `Note`, `Collaborator`, `Session`).
- Repository interfaces (abstract bases prefixed `_`, e.g., `_NotebookRepository`).
- Event types and the `EventRegistry`.
- Pure transformation functions (serializers, validators, policy checks).

The core layer compiles cleanly in isolation — its package can be lifted out and reused in a separate project (a future native mobile client, for example) without modification.

### Layer 2: Data (Infrastructure)

Postgres-specific implementations under `src/data/`. One concrete class per repository interface, prefixed `Postgres_`:

- `Postgres_AccountRepository implements _AccountRepository`
- `Postgres_NotebookRepository implements _NotebookRepository`
- `Postgres_NoteRepository implements _NoteRepository`
- `Postgres_CollaboratorRepository implements _CollaboratorRepository`
- `Postgres_SessionRepository implements _SessionRepository`

Each repository handles its own SQL via a parameterized query builder; no ORM. Row-to-domain mapping is done in private `toEntity()` helpers — domain types never leak Postgres-specific concerns (timestamps as `Date`, JSON columns as parsed objects, etc.). Connection pooling is handled by a single shared `pg.Pool` injected at startup.

### Layer 3: API (HTTP + WebSocket)

Express controllers under `src/api/` and the WebSocket gateway under `src/realtime/`. Controllers are thin — they parse the incoming request, call a service method, and serialize the response. They never contain business logic.

Authentication is enforced by a single `requireSession` middleware applied to every router except the explicitly public endpoints. Permission checks are enforced by the `requirePermission(notebookIdParam, minLevel)` middleware from Epic 4. Both middlewares inject their resolved values onto `req.locals` for downstream handlers to use.

Error responses are produced by a single `errorHandler` middleware that catches all thrown `AppError` instances and serializes them into the standard error response shape. Unknown errors are logged, surfaced as `INTERNAL_ERROR`, and the stack trace is included only when `NODE_ENV !== "production"`.

### Layer 4: Frontend (Single-Page Web App)

A React + TypeScript SPA under `web/src/`, organized by feature module:

- `web/src/features/auth/` — login, registration, profile pages.
- `web/src/features/notebooks/` — notebook tree, notebook settings.
- `web/src/features/notes/` — note editor, note metadata UI.
- `web/src/features/collaboration/` — presence indicators, live cursors, toasts.
- `web/src/features/permissions/` — collaborator management UI.

Each feature owns its own types, components, hooks, tests, and styles. Cross-feature dependencies go through a shared module at `web/src/shared/`. The realtime client is a single `useRealtimeClient` hook that exposes typed subscribe/unsubscribe primitives and an event stream — features consume it without knowing about the underlying WebSocket.

State management uses React Context for auth and presence (cross-cutting), `useState` for component-local state, and a small `useReducer`-based store for the active note document (where conflict resolution policy lives). No Redux, no MobX — the application's state needs do not justify the abstraction overhead.

## Risks & Mitigations

### Risk: Conflict storms in shared notes

When multiple users edit the same paragraph simultaneously, the conflict resolution policy described in Story 3.2 will sometimes overwrite a user's local edit with an incoming one. This is acceptable for the first release but could feel jarring under heavy concurrent editing.

**Mitigation:** Toast warnings make the overwrite visible. Future work (out of scope for this PRD) will introduce a CRDT-based merge layer; the conflict-resolution boundary is isolated in the `useReducer` store so it can be swapped without touching the editor or sync layers.

### Risk: WebSocket connection scaling

A single Node.js process can hold ~10k concurrent WebSocket connections before memory pressure becomes an issue. Beyond that, horizontal scaling requires sticky sessions or a shared subscription registry.

**Mitigation:** The Real-time Sync Backbone epic uses Redis pub/sub, which is shared-state — multiple Node instances can subscribe to the same channels without coordination. Sticky sessions at the load balancer are sufficient for the first deployment; the architecture supports a future move to a dedicated WebSocket fleet without API rewrites.

### Risk: Permission check skew across layers

A bug in the permission middleware that allows a request through to a controller, where a second permission check then catches it (or worse, doesn't), creates an information leak.

**Mitigation:** Permission checks live in exactly one place — the middleware. Controllers never re-check permissions. Repository methods do not filter by permission; they trust their caller. Integration tests assert that every protected route returns `403` (not `401` or `404`) when the caller has insufficient permission.

### Risk: Session-cookie security

Session cookies are the auth credential; if they leak (XSS, network sniffing, broken HTTPS), accounts are compromised.

**Mitigation:** Cookies are `HttpOnly` (no JS access), `Secure` (HTTPS only), and `SameSite=Lax`. Logout invalidates server-side state, not just the cookie. The Argon2id hashing parameters meet OWASP recommendations as of 2024.

### Risk: Audit log retention

The `permission_audit_log` table grows monotonically. Without retention, it will eventually dominate storage costs.

**Mitigation:** Out of scope for this PRD — the table is small for early customers. A future story will introduce time-based partitioning and a retention policy.

## Migration Plan

The application is greenfield — no existing data to migrate. However, the database schema evolves across the four implementation epics, so each epic introduces forward-only migrations under `migrations/`:

- Epic 1 migrations: `001_accounts.sql`, `002_sessions.sql`
- Epic 2 migrations: none (Redis is ephemeral; no schema)
- Epic 3 migrations: none (UI only)
- Epic 4 migrations: `003_notebooks.sql`, `004_notes.sql`, `005_notebook_collaborators.sql`, `006_permission_audit_log.sql`

The `migrations/` table is the source of truth for migration journal state. Each migration is run inside a transaction; failures roll back automatically. There is no down-migration mechanism — fix-forward is the only supported recovery path.

A single seed script populates a development database with two demo accounts, one shared notebook, and three sample notes so the UI epics can be developed against realistic data.

## Deployment

Production deployment is a Docker image built from this repo, run on a single Linux host behind an nginx reverse proxy. The image runs three processes via a small process manager:

- The Node.js API server (port 3000)
- A Postgres client connection pool warmer
- A Redis client connection pool warmer

Postgres and Redis run as separate services (managed Postgres on the cloud provider, managed Redis cache). Connection strings come from environment variables; no secrets are baked into the image.

CI builds the image on every merge to `main` and publishes it tagged with the git SHA. Production deployment is currently manual — the operator pulls the image, runs `docker compose up -d`, and verifies via the `/healthz` endpoint.

A future epic will add zero-downtime deployment via blue-green swap; out of scope here.

## Telemetry

Every API request emits a structured log line with: timestamp, request ID, method, path, status, duration, account ID (or `anonymous`), and (for failures) the error code. Logs are JSON, written to stdout, and collected by the host's log shipper.

Every realtime event emits a similar log line with: event ID, type, notebook ID, actor ID, publish duration. The `Sync delivery latency test` story (Story 2.5) consumes these logs to compute its p99 metric.

A small number of business metrics are exported to a Prometheus-compatible endpoint at `/metrics`:

- `notebook_count` (gauge): total notebooks in the system
- `account_count` (gauge): total accounts
- `realtime_connections` (gauge): currently connected WebSocket clients
- `sync_event_publish_duration_seconds` (histogram): publish latency
- `auth_login_failures_total` (counter): increments on each failed login attempt

Dashboards and alerts are configured in the operator's Grafana instance; configuration is out of scope for this PRD.

## Out of Scope

- Mobile apps (separate spec).
- Offline mode (separate spec).
- End-to-end encryption (separate spec).
- Third-party integrations (Slack, GitHub, etc.).
- Self-hosted deployment automation.
- Advanced search (full-text indexing of note bodies).
- Notebook templates or "starter" content.
- Export to other formats (PDF, Markdown, EPUB).
- Internationalization beyond English-language UI strings.
- Accessibility audit / WCAG conformance — to be addressed in a dedicated accessibility epic.

## Dependencies Across Epics

- Epic 2 (Sync Backbone) depends on Epic 1 (Authentication & Identity) — the WebSocket gateway authenticates connections.
- Epic 3 (Collaboration UI) depends on Epic 2 (Sync Backbone) for the realtime client.
- Epic 4 (Permissions & Sharing) depends on Epic 1 (account model) and Epic 2 (sync events for permission changes).
- All implementation epics depend on the design-spike epic that this PRD will auto-trigger — the foundational ADR and per-epic CONTEXT.md files inform every implementation subagent's work.
