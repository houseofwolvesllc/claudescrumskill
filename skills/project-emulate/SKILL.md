---
name: project-emulate
description: Systematically walk through every user-facing workflow in a project by reading the codebase, discovering all roles and functionality, then emulating each role through the complete lifecycle from deployment to teardown. Claude Code figures out the roles, permissions, actions, and permutations itself — no manifests or configuration needed.
---

# Project Emulate

Claude Code reads the codebase, discovers everything, and walks through it all. No config files. No role manifests. No manual setup. Claude is smart enough to figure out what exists and what every role can do.

---

## The Job

1. **Read the project** — understand what it is, what it does, how it's structured
2. **Discover every role** — find all user types, service accounts, admin levels, anonymous access
3. **Discover every action** — find all routes, commands, workflows, infrastructure operations
4. **Map permissions** — determine what each role can and cannot do
5. **Walk through everything** — emulate each role executing each action across the full lifecycle
6. **Report coverage** — what works, what's broken, what's missing, what's unreachable

---

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

---

## Phase 2: Build the Permutation Matrix

After discovery, construct the complete matrix:

```
Roles × Actions × Lifecycle Stages = Total Permutations
```

Organize this as a structured walkthrough plan:

For each **lifecycle stage** (in order):
For each **role** (from most privileged to least):
For each **action available at this stage**: - What should happen (success path) - What should be denied (permission boundary) - What edge cases exist (empty states, conflicts, limits)

**Critical**: Include negative cases. For every action a role CAN do, verify that less-privileged roles CANNOT. Permission boundaries are as important as happy paths.

---

## Phase 3: Walkthrough

Execute the walkthrough by narrating through every cell in the matrix. For each action:

1. **State the context**: "As [role], during [lifecycle stage], attempting to [action]"
2. **Trace the code path**: Follow the request through middleware → handler → service → database
3. **Identify the outcome**: Success, permission denied, validation error, or missing implementation
4. **Note edge cases**: What happens with empty data, concurrent access, invalid input
5. **Flag issues**: Anything that looks broken, missing, inconsistent, or insecure

### Walkthrough Order

Follow the natural lifecycle. A typical ordering:

```
1. INFRASTRUCTURE
   - Deploy (IaC, containers, serverless)
   - Configure (env vars, secrets, feature flags)
   - Verify (health checks, smoke tests)

2. BOOTSTRAP
   - Database migration
   - Seed data / initial admin creation
   - System configuration

3. ADMIN OPERATIONS
   - User/role management (create, assign, modify, deactivate)
   - System settings
   - Feature flags / toggles
   - Monitoring and logging setup

4. USER ONBOARDING
   - Registration / invitation
   - Authentication (login, MFA, SSO, password reset)
   - Profile setup
   - Initial permissions / default state

5. CORE FUNCTIONALITY
   - All CRUD operations per resource type
   - Search, filter, sort, paginate
   - Relationships between resources
   - File uploads, exports, imports

6. ADVANCED WORKFLOWS
   - Multi-step processes (approval chains, state machines)
   - Integrations (webhooks, third-party APIs)
   - Batch operations
   - Notifications and communications

7. EDGE CASES & BOUNDARIES
   - Empty states (no data yet)
   - Limit testing (max records, file size limits, rate limits)
   - Concurrent access patterns
   - Error handling and recovery

8. MAINTENANCE
   - Backup and restore
   - Data migration
   - Version upgrades
   - Log rotation, cleanup jobs

9. TEARDOWN
   - User account deletion (soft delete, hard delete, GDPR)
   - Resource cleanup
   - Infrastructure destruction
   - Data export before shutdown
```

Not every project will have all stages. Skip what doesn't apply. Add stages that are unique to the project.

---

## Phase 4: Coverage Report

After the walkthrough, produce a structured report:

### Summary

- Total roles discovered
- Total actions discovered
- Total permutations walked
- Coverage percentage (walked / total possible)

### Role Map

For each role, list:

- All permitted actions (with lifecycle stage)
- All denied actions (verified permission boundary)
- Any actions with ambiguous or missing permission checks

### Issues Found

Categorize by severity:

- **🔴 Critical**: Permission escalation paths, missing auth checks, broken core flows
- **🟡 Warning**: Inconsistent behavior, missing error handling, undocumented features
- **🔵 Info**: Dead code, unreachable features, minor edge cases

### Missing Coverage

- Actions that exist in code but aren't reachable by any role
- Roles referenced in code but never fully defined
- Lifecycle stages with no corresponding implementation
- Permission checks that reference non-existent roles or actions

### Permission Matrix

A clean table: Roles as rows, Actions as columns, cells showing ✅ allowed / ❌ denied / ⚠️ ambiguous / — not applicable

---

## Execution Notes

**Be exhaustive but structured.** The whole point is 100% coverage. Don't skip actions because they seem trivial. Don't skip roles because they seem obvious. Walk through everything.

**Follow the code, not the docs.** Documentation might be outdated. The code is the source of truth. If docs say one thing and code does another, report the discrepancy.

**Think like each role.** When emulating a base user, think about what a real user would try — including things they shouldn't be able to do. When emulating an admin, think about every configuration surface.

**Track state across the walkthrough.** Actions in later lifecycle stages depend on earlier ones. A user can't edit a resource that was never created. Walk through in order so dependencies are naturally satisfied.

**Report, don't fix.** The job is to discover and document, not to fix issues inline. Flag everything clearly so it can be prioritized and addressed separately.

---

## Output

Save the walkthrough results to the project .claude/reports. The output structure:

```
emulation-report/
├── SUMMARY.md              # High-level findings and coverage stats
├── DISCOVERY.md            # All roles, actions, and permissions found
├── WALKTHROUGH.md          # The complete narrated walkthrough
├── PERMISSION-MATRIX.md    # Role × Action matrix table
└── ISSUES.md               # All issues found, categorized by severity
```

If the project is large, split the walkthrough by lifecycle stage:

```
emulation-report/
├── SUMMARY.md
├── DISCOVERY.md
├── walkthrough/
│   ├── 01-infrastructure.md
│   ├── 02-bootstrap.md
│   ├── 03-admin-operations.md
│   ├── 04-user-onboarding.md
│   ├── 05-core-functionality.md
│   ├── 06-advanced-workflows.md
│   ├── 07-edge-cases.md
│   ├── 08-maintenance.md
│   └── 09-teardown.md
├── PERMISSION-MATRIX.md
└── ISSUES.md
```
