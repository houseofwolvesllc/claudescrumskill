---
title: User Profile Avatar Upload
---

# User Profile Avatar Upload

## Overview

Add support for users to upload, display, and remove a custom profile avatar image. Replaces the current initials-based placeholder. Single feature, single epic, no cross-cutting architectural concerns — exists as a fixture for verifying that the scaffold skill's single-pass path remains the default for small PRDs.

## Objectives

- Authenticated users can upload an image (JPEG/PNG, max 5 MB) as their profile avatar.
- Avatars display wherever the user's identity appears in the UI (header, comments, profile page).
- Users can remove their avatar, reverting to the initials placeholder.
- Avatars are served through a cached CDN URL, not directly from the application.

## Epic: Avatar Upload

### Stories

#### Story: Add avatar upload API endpoint

**Priority:** P1-high
**Executor:** claude
**Story Points:** 3

**Acceptance Criteria:**
- `POST /api/v1/users/me/avatar` accepts multipart form data with a single `avatar` file field.
- Server validates: file type is `image/jpeg` or `image/png`, file size ≤ 5 MB.
- Validation failures return `400 Bad Request` with a structured error code (`AVATAR_INVALID_TYPE`, `AVATAR_TOO_LARGE`).
- On success, the file is uploaded to object storage under the key `avatars/<user-id>/<sha256>.<ext>`, the user row is updated with the new key, and the endpoint returns `200 OK` with the new CDN URL.
- Existing avatar (if any) is deleted from object storage after the new one is committed (best-effort, logged on failure).
- Unit tests cover happy path, invalid type, too large, and unauthenticated request.

#### Story: Add avatar deletion endpoint

**Priority:** P1-high
**Executor:** claude
**Story Points:** 2

**Acceptance Criteria:**
- `DELETE /api/v1/users/me/avatar` removes the user's avatar key and deletes the object from storage.
- Returns `204 No Content` on success (idempotent — succeeds even if user had no avatar).
- Unit tests cover successful delete, idempotent delete on user with no avatar, and unauthenticated request.

#### Story: Build avatar upload UI on the profile page

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 5

**Acceptance Criteria:**
- Profile page shows the current avatar (or initials placeholder) at 128×128 px.
- "Change Avatar" button opens a file picker accepting `.jpg`, `.jpeg`, `.png`.
- After selection, the UI shows a 1:1 crop preview and Save / Cancel buttons.
- On Save, the cropped image is POSTed to `/api/v1/users/me/avatar`; the page updates immediately on success.
- On failure, an error toast shows the validation message; the existing avatar remains unchanged.
- "Remove Avatar" button (only visible if an avatar exists) calls `DELETE /api/v1/users/me/avatar` after a confirmation dialog.
- Component tests cover the upload flow, the cancel flow, the error toast, and the remove flow.

#### Story: Show avatar in header and comment threads

**Priority:** P2-medium
**Executor:** claude
**Story Points:** 2

**Acceptance Criteria:**
- The existing `<UserAvatar>` component already used in the header and comment threads is updated to render the uploaded image when present and fall back to initials when absent.
- The component accepts a `size` prop (`sm` = 24 px, `md` = 32 px, `lg` = 48 px) and renders the CDN URL with an appropriate query-string size parameter for browser caching.
- Snapshot tests cover both branches (with and without avatar URL) at each size.

## Technical Constraints

- Object storage is the existing S3-compatible bucket already used for file attachments.
- CDN URL pattern matches the existing pattern for attachments: `https://cdn.example.com/<bucket-key>?w=<size>`.
- No new dependencies; use the existing image-handling utilities.
- All four stories are independent (no cross-story blockers) — they can be implemented in any order.

## Out of Scope

- Avatar moderation / NSFW detection (separate spec).
- Animated avatars (GIF/WebP) — explicitly disallowed.
- Bulk import from external services (Gravatar, OAuth providers).
