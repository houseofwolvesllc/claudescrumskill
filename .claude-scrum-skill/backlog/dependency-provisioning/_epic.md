---
title: Dependency Provisioning
slug: dependency-provisioning
status: open
created: 2026-08-17T18:20:51Z
subdomain: core
---

# Dependency Provisioning

How a fresh worktree obtains its dependency directory. Four strategies with different preconditions, costs, and refusal conditions: assume-present (today's behaviour), clone (copy-on-write, fast and isolated but non-validating), install (slow, disk-hungry, and the only validating option), and symlink (fastest, but shared mutable state). The choice is story-aware: clone by default, escalating to install for any story that touches package.json or a lockfile, so clean-install validation lands exactly where dependency correctness is at stake. The isolation gate is rewritten to select worktree mode whenever a viable strategy exists rather than only when node_modules is tracked.

## Shared Design Concerns

- Fail loud, never silently degrade: every substitution is logged with its reason
- clone must fall back to install when the filesystem has no copy-on-write support, never to a silent expensive copy
- symlink must refuse a batch containing a dependency-touching story rather than downgrading, because a caller who asked for symlink and got something else has wrong information about their run
- Backward compatible: a caller passing no dependencyStrategy behaves exactly as today
- Any new _shared/ module is inlined into the consuming scripts per the inline_manifest convention
- Do not pin model IDs; do not add verification or double-check phrasing
