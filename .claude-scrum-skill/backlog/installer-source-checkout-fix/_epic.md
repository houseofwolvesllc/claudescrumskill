---
title: Installer Source Checkout Fix
slug: installer-source-checkout-fix
status: open
created: 2026-08-07T20:10:22Z
subdomain: supporting
---

# Installer Source Checkout Fix

bin/install.js resolves its target by walking up from __dirname looking for a node_modules ancestor. Run from a source checkout none exists, the loop terminates at the filesystem root, and the installer targets /.claude/skills. Detect the source-checkout case and resolve to the repo root.

## Shared Design Concerns

- The existing global (npm_config_global) and node_modules install paths must keep working unchanged
