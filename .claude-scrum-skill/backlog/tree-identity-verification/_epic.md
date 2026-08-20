---
title: Tree Identity Verification
slug: tree-identity-verification
status: open
created: 2026-08-20T17:34:14Z
subdomain: core
---

# Tree Identity Verification

A verify agent was placed in one worktree and handed a path whose content lived in another, roughly twelve times in a single run, producing at least four false BLOCKED reports and about fourteen cascaded blocks. The cause is that a branch ref is locked to one worktree while a commit is not, so verify's `git checkout <branch>` fails when the implement stage holds that branch. Verification now detaches at the implement stage's head SHA and asserts `git rev-parse HEAD` matches before reporting anything about file content, so a wrong tree is reported as a tree-identity failure rather than as an empty directory.

## Shared Design Concerns

- A wrong tree is an infrastructure failure, not a code failure — reuse infrastructure-failed rather than inventing a second vocabulary
- Identity must be asserted BEFORE content is reported; a content finding from an agent that never asserted identity is not actionable
- Backward compatible: no SHA supplied degrades to current behaviour rather than failing
- New fields must be genuinely threaded, not merely declared — test/probe_schema_coverage.test.js exists because three consecutive releases shipped a field nothing supplied
