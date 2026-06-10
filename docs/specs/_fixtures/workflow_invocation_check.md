---
title: Workflow Invocation Check
scaffold_mode: two-pass
---

# Workflow Invocation Check

Minimal PRD designed so its full orchestration exercises every workflow script shipped with v2.0.0 at least once. Used as the v2.0.0 smoke test post-merge.

## Overview

Builds a tiny shareable image-resizer module — three small epics with cross-cutting design concerns sufficient to trigger the design-spike pre-epic. Carries `scaffold_mode: two-pass` frontmatter to force two-pass scaffolding so `elaborate_epics.js` runs; the multi-epic structure auto-triggers the design-spike injection so the foundational ADR is authored. Sprint execution exercises `sprint_pipeline.js`. The emulation hardening pass exercises `adversarial_verify.js`. The cleanup phase exercises `review_panel.js`.

When orchestrating this fixture, the workflow tool UI should show four named workflow runs in addition to the per-spec orchestration:

- `elaborate-epics` (during scaffold)
- `sprint-pipeline` (one per sprint executed; expect 2-3)
- `adversarial-verify` (during emulation Phase 5.5)
- `review-panel` (during cleanup Phase 5.5)

If any of these don't appear, the corresponding skill rewrite didn't take effect in this Claude Code session — likely the Workflow tool isn't available or the skill markdown wasn't picked up post-install.

## Cross-Cutting Concerns

These exist to give the design-spike epic concrete material for the foundational ADR and per-epic CONTEXT.md files. Aim for terse — the fixture's job is exercising mechanism, not modeling a real product.

### Identifier Types

```typescript
export type ImageId = string & { readonly __brand: "ImageId" };
export type ResizeJobId = string & { readonly __brand: "ResizeJobId" };
```

### Error Response Shape

```json
{ "error": { "code": "INVALID_IMAGE", "message": "...", "fields": {} } }
```

### File Layout

- Core types: `src/core/<entity>/types.ts`
- Pipeline implementations: `src/pipeline/<stage>/`
- HTTP layer: `src/api/<resource>/<resource>_controller.ts`

## Epic 1: Input Validation

Accept uploaded images, validate format, persist to staging. Three stories.

### Stories

#### Story 1.1: HTTP upload endpoint

**Priority:** P1-high
**Executor:** claude
**Story Points:** 3
**Acceptance Criteria:**
- `POST /api/v1/images` accepts multipart upload with field `image`.
- Validates: content-type is `image/jpeg` or `image/png`, file size ≤ 10 MB.
- Returns `201 Created` with `{ imageId: ImageId, status: "staged" }` on success.
- Invalid content-type → `400` with code `INVALID_IMAGE`.
- Oversize → `413` with code `IMAGE_TOO_LARGE`.

#### Story 1.2: Staging persistence

**Priority:** P1-high
**Executor:** claude
**Story Points:** 2
**Acceptance Criteria:**
- New ImageId generated as ULID.
- Uploaded bytes persisted to staging storage at key `staged/<imageId>`.
- Metadata row inserted into `images` table.

#### Story 1.3: Validation tests

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 2
**Acceptance Criteria:**
- Happy-path upload returns 201 with valid ImageId.
- Invalid content-type rejected with 400 + correct error code.
- Oversize rejected with 413 + correct error code.

## Epic 2: Resize Pipeline

Background job that reads a staged image and produces resized variants.

### Stories

#### Story 2.1: Job enqueue endpoint

**Priority:** P1-high
**Executor:** claude
**Story Points:** 3
**Acceptance Criteria:**
- `POST /api/v1/images/:imageId/resize` accepts `{ widths: number[] }`.
- Validates: imageId exists in `images`, widths in 1-4096.
- Returns `202 Accepted` with `{ jobId: ResizeJobId }`.

#### Story 2.2: Resize worker

**Priority:** P1-high
**Executor:** claude
**Story Points:** 5
**Acceptance Criteria:**
- Worker polls job queue, reads staged image, produces resized variants.
- Variants persisted at key `resized/<imageId>/<width>.jpg`.
- Job status updated to `done` on success, `failed` with reason on error.

#### Story 2.3: Pipeline integration tests

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 3
**Acceptance Criteria:**
- End-to-end: upload → enqueue → worker → verify variants exist.
- Worker failure path: malformed image → job status `failed` with reason.

## Epic 3: Retrieval

Fetch resized variants by ImageId + width.

### Stories

#### Story 3.1: Variant retrieval endpoint

**Priority:** P1-high
**Executor:** claude
**Story Points:** 2
**Acceptance Criteria:**
- `GET /api/v1/images/:imageId/variants/:width` returns the resized image bytes with appropriate content-type.
- 404 if no such variant.

#### Story 3.2: Retrieval tests

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 1
**Acceptance Criteria:**
- 200 happy path returns image bytes.
- 404 for missing variant.

## Out of Scope

- Authentication, authorization, rate limiting.
- CDN integration, cache invalidation.
- Animated images, video.
