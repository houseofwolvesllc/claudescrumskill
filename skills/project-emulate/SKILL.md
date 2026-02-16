---
name: project-emulate
description: Systematically walk through every user-facing workflow in a project by reading the codebase, discovering all roles and functionality, then emulating each role through the complete lifecycle from deployment to teardown. Claude Code figures out the roles, permissions, actions, and permutations itself — no manifests or configuration needed.
allowed-tools: Bash, Read, Grep, Glob, Write
---

# Project Emulate

Claude Code reads the codebase, discovers everything, and walks through it all. No config files. No role manifests. No manual setup. Claude is smart enough to figure out what exists and what every role can do.

## The Job

1. **Read the project** — understand what it is, what it does, how it's structured
2. **Discover every role** — find all user types, service accounts, admin levels, anonymous access
3. **Discover every action** — find all routes, commands, workflows, infrastructure operations
4. **Map permissions** — determine what each role can and cannot do
5. **Walk through everything** — emulate each role executing each action across the full lifecycle
6. **Report coverage** — what works, what's broken, what's missing, what's unreachable

## Phase 1: Discovery

Read the entire project. Build a complete mental model. Scan for:

**Roles** — Look everywhere roles are defined or referenced:
- Auth middleware, RBAC configs, policy files, guard decorators
- Role enums, permission constants, user type definitions
- Database seeds/fixtures/migrations that create default roles
- IAM policies, service account definitions, API key scopes
- Environment-specific roles (dev vs staging vs prod)
- Don't forget: anonymous/unauthenticated users, system/cron jobs, CI/CD service accounts

**Actions** — Find every thing a user or system can do:
- Route files, controllers, API handlers (REST, GraphQL, gRPC, WebSocket)
- CLI commands and subcommands
- UI pages, forms, buttons, workflows
- Background jobs, scheduled tasks, event handlers
- Infrastructure operations (deploy, scale, configure, destroy)
- Database operations (migrate, seed, backup, restore)
- Admin-only operations (user management, config changes, feature flags)

**Permission Boundaries** — Map which roles can do which actions:
- Route-level guards and middleware chains
- Field-level permissions (what data each role can see/edit)
- Resource ownership rules (users can edit their own, admins can edit all)
- State-dependent permissions (e.g., only draft posts can be deleted by authors)
- Rate limits or quotas that differ by role

**Lifecycle Stages** — Identify the natural ordering of operations:
- Infrastructure provisioning and deployment
- Initial setup and configuration
- User/account creation and onboarding
- Normal CRUD operations
- Advanced/power-user workflows
- Administrative operations
- Maintenance and migration
- Teardown and destruction

## Phase 2: Build the Permutation Matrix

After discovery, construct the complete matrix:

```
Roles × Actions × Lifecycle Stages = Total Permutations
```

Organize this as a structured walkthrough plan:

For each **lifecycle stage** (in order):
  For each **role** (from most privileged to least):
    For each **action available at this stage**:
      - What should happen (success path)
      - What should be denied (permission boundary)
      - What edge cases exist (empty states, conflicts, limits)

**Critical**: Include negative cases. For every action a role CAN do, verify that less-privileged roles CANNOT. Permission boundaries are as important as happy paths.

## Phase 3: Walkthrough

Execute the walkthrough by narrating through every cell in the matrix. For each action:

1. **State the context**: "As [role], during [lifecycle stage], attempting to [action]"
2. **Trace the code path**: Follow the request through middleware → handler → service → database
3. **Identify the outcome**: Success, permission denied, validation error, or missing implementation
4. **Note edge cases**: What happens with empty data, concurrent access, invalid input
5. **Flag issues**: Anything that looks broken, missing, inconsistent, or insecure

### Walkthrough Order

Follow the natural lifecycle:

```
1. INFRASTRUCTURE — Deploy, configure, verify (health checks, smoke tests)
2. BOOTSTRAP — Database migration, seed data, initial admin creation
3. ADMIN OPERATIONS — User/role management, system settings, feature flags
4. USER ONBOARDING — Registration, authentication, profile setup
5. CORE FUNCTIONALITY — All CRUD operations, search, relationships, file handling
6. ADVANCED WORKFLOWS — Multi-step processes, integrations, batch operations, notifications
7. EDGE CASES & BOUNDARIES — Empty states, limits, concurrent access, error handling
8. MAINTENANCE — Backup/restore, data migration, upgrades, cleanup jobs
9. TEARDOWN — Account deletion, resource cleanup, infrastructure destruction, data export
```

Not every project will have all stages. Skip what doesn't apply. Add stages unique to the project.

## Phase 4: Coverage Report

After the walkthrough, produce a structured report:

### Summary
- Total roles discovered
- Total actions discovered
- Total permutations walked
- Coverage percentage (walked / total possible)

### Issues Found
Categorize by severity:
- **Critical**: Permission escalation paths, missing auth checks, broken core flows
- **Warning**: Inconsistent behavior, missing error handling, undocumented features
- **Info**: Dead code, unreachable features, minor edge cases

### Missing Coverage
- Actions that exist in code but aren't reachable by any role
- Roles referenced in code but never fully defined
- Lifecycle stages with no corresponding implementation
- Permission checks that reference non-existent roles or actions

### Permission Matrix
A clean table: Roles as rows, Actions as columns, cells showing allowed / denied / ambiguous / not applicable

## Output

Save results to:

```
emulation-report/
├── SUMMARY.md              # High-level findings and coverage stats
├── DISCOVERY.md            # All roles, actions, and permissions found
├── WALKTHROUGH.md          # The complete narrated walkthrough
├── PERMISSION-MATRIX.md    # Role × Action matrix table
└── ISSUES.md               # All issues found, categorized by severity
```

For large projects, split the walkthrough by lifecycle stage into a `walkthrough/` subdirectory.

## Execution Notes

**Be exhaustive but structured.** The whole point is 100% coverage. Don't skip actions because they seem trivial. Walk through everything.

**Follow the code, not the docs.** The code is the source of truth. If docs say one thing and code does another, report the discrepancy.

**Think like each role.** Including things they shouldn't be able to do.

**Track state across the walkthrough.** Walk in lifecycle order so dependencies are naturally satisfied.

**Report, don't fix.** Discover and document. Flag everything clearly for separate prioritization.
