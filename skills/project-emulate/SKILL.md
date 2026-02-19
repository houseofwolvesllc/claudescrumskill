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
5. **Validate integration seams** — check that Docker, build tools, transpilers, IoC containers, and config files are mutually consistent (can this thing even start?)
6. **Validate layer contracts** — trace data through response helpers, middleware chains, IoC resolution, config stores, and error handlers to verify every layer agrees on data shapes at runtime (when a request flows end-to-end, do all the layers agree?)
7. **Walk through everything** — emulate each role executing each action across the full lifecycle
8. **Report coverage** — what works, what's broken, what's missing, what's unreachable

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

## Phase 2: Integration Seam Validation

Before walking through application logic, verify the project can actually start. Integration seam failures — where two components make incompatible assumptions about each other — prevent the application from booting at all. These bugs pass typecheck, lint, and unit tests but explode at runtime.

Check each category below. Skip categories that don't apply to the project (e.g., skip Docker checks if there are no Dockerfiles). Flag every issue found using the standard severity levels.

---

### Category 1: Dockerfile ↔ Source Code Consistency

If the project has Dockerfiles, verify each one is internally consistent with the source code it packages.

**COPY completeness** — For each Dockerfile, identify all workspace packages imported by the application code (`from "@scope/pkg"`, `require("@scope/pkg")`). Verify each imported package has:
- A corresponding `COPY` directive that brings the source into the image
- A build step (`RUN npm run build --workspace=pkg`, `RUN go build ./pkg`, etc.) if the package requires compilation
- Flag any package that is imported by the application but not copied or built in the Dockerfile

**WORKDIR ↔ path resolution** — For every `path.resolve(__dirname, ...)`, `path.join(__dirname, ...)`, `fileURLToPath(import.meta.url)`, or similar path computation in the codebase:
- Compute the resolved path relative to the Dockerfile's `WORKDIR` (not relative to the source tree on the developer's machine)
- Flag any path that would resolve outside the expected directory or point to a non-existent location when running inside the container

**WORKDIR ↔ CMD consistency** — Verify that the `CMD` or `ENTRYPOINT` runs from a working directory where all expected files exist:
- `index.html` for Vite/webpack dev servers
- `package.json` for npm scripts
- Config files loaded by the application at startup
- Migration files referenced by relative paths

**Volume mount shadows** — In docker-compose, check that volume mounts don't shadow files generated during the Docker build:
- Mounting `./src` over a directory that contains `dist/` compiled during build
- Mounting a directory that overwrites `node_modules/` installed during `RUN npm ci`
- Flag mounts that could invalidate build artifacts

---

### Category 2: Build Tool / Transpiler Compatibility

Verify that the transpiler or bundler used at runtime supports all language features the code depends on.

**Decorator metadata** — If the codebase uses `emitDecoratorMetadata: true` in tsconfig AND the runtime transpiler is `tsx`, `esbuild`, or `swc` (without an explicit decorator metadata plugin):
- Flag as 🔴 Critical — these transpilers silently drop `Reflect.metadata("design:paramtypes", ...)` calls
- Any IoC container that relies on constructor parameter type reflection (`Reflect.getMetadata("design:paramtypes", ...)`) will silently receive `undefined` for all constructor parameters
- Controllers, repositories, and services will be instantiated with missing dependencies
- The fix is to pre-compile with `tsc` and run the compiled JavaScript, or use a transpiler that supports decorator metadata

**Build tool CWD assumptions** — For tools that resolve config files relative to CWD, verify the Dockerfile's `WORKDIR` matches the directory where the config file lives:
- **Vite**: `root` defaults to CWD. If `vite.config.ts` is in a subdirectory, either the `root` option must be set explicitly or `WORKDIR` must be changed before `CMD`
- **Tailwind CSS**: Config resolution starts from CWD. If `tailwind.config.ts` is in a subdirectory, the tool won't find it and will use defaults (causing missing utility class errors)
- **PostCSS**: Config resolution starts from the processed file's directory, walking up. Verify the config is findable from the CSS file's location
- **ESLint, Prettier, Jest/Vitest**: Similar CWD-relative resolution — verify config is discoverable

**Framework reserved names** — Check environment/mode names used in docker-compose, Dockerfiles, and CLI arguments against known reserved names:
- **Vite**: `"local"` is reserved — conflicts with `.env.local` convention and will throw an error at startup
- **Node.js**: `"production"` triggers specific behaviors in Express, React, and many libraries (minification, error suppression, etc.)
- **Next.js**: `"development"`, `"production"`, `"test"` are the only recognized `NODE_ENV` values
- Flag any environment name that collides with a framework convention

---

### Category 3: Configuration File Coverage

Verify that every environment name referenced anywhere in the stack has a corresponding config file in every package that loads config by environment name.

**Environment name inventory** — Collect every environment name from all sources:
- `docker-compose.yml` / `docker-compose.*.yml` environment variables (`NODE_ENV`, `VITE_MODE`, etc.)
- Dockerfile `CMD` and `ENTRYPOINT` arguments
- `.env` / `.env.*` files
- Code defaults and fallbacks (e.g., `import.meta.env.MODE || 'moto'`, `process.env.NODE_ENV || 'development'`)
- CI/CD pipeline configurations

**Config file cross-reference** — For each package that loads config by environment name (e.g., `config/${environment}.infrastructure.json`, `settings/${env}.yaml`):
- List all config files that exist on disk
- Cross-reference against the environment name inventory
- Flag any environment name that has no matching config file

**Mode/environment mapping** — If different tools use different naming:
- Vite uses `import.meta.env.MODE` which defaults to `"development"` in dev mode
- Node.js uses `process.env.NODE_ENV` which might be set to `"local"` or `"dev"`
- Verify the mapping between these is explicit, not relying on implicit defaults that diverge
- Flag cases where Tool A's default name doesn't match Tool B's config file naming

---

### Category 4: IoC Container / Dependency Injection Integrity

If the project uses dependency injection or an IoC container, verify every binding is resolvable at runtime with the correct type.

**Async factory in sync container** — If the IoC container's `resolve` method does NOT `await` factory results:
- Flag any factory registered with `async () => ...` as 🔴 Critical
- The injected value will be a `Promise<T>` instead of `T`
- Any method call on the injected value will fail with `undefined is not a function` or similar
- The fix is to make the factory synchronous, or to pre-resolve the async value before binding

**Constructor parameter coverage** — For every class decorated with `@Injectable()` (or equivalent) that has constructor parameters:
- Verify each parameter type has a corresponding `container.bind(...)` or `container.register(...)` call
- For named injections (`@Inject("name")`, `@Named("name")`), verify a matching named binding exists
- Flag any constructor parameter that has no corresponding binding

**Binding order dependencies** — If bindings are registered at module scope (top-level code in entry files):
- Verify that the registration order doesn't create temporal dependencies
- Example: Binding A's factory references Binding B, but B is registered after A
- Flag order-dependent bindings that could break if import order changes

**Decorator metadata availability** — Cross-reference with Category 2 (Decorator metadata check):
- If the transpiler doesn't support `emitDecoratorMetadata`, then ALL constructor injection that relies on `Reflect.getMetadata("design:paramtypes", ...)` will silently fail
- Parameters will be `undefined`, constructors will receive no arguments
- Services will appear to resolve but will have `undefined` for all injected fields
- This is particularly insidious because it fails silently — no error is thrown, the object is just broken

---

### Category 5: Docker Compose ↔ Service Contract Validation

If the project uses docker-compose, verify that services agree on their contracts.

**Port mapping consistency** — For each service:
- Verify the port in the Dockerfile `EXPOSE` matches the port mapping in docker-compose (`"host:container"`)
- Verify the application code listens on the same port (e.g., `app.listen(PORT)` matches the container port)
- Flag mismatches between any of these three values

**Inter-service URL consistency** — For services that call each other:
- Inside Docker networks, services are reachable by service name (e.g., `http://api:3001`), not `localhost`
- Client-side code (browser JavaScript) must use `localhost` because it runs outside Docker
- Verify that URLs configured for server-to-server calls use service names, and URLs for browser-to-server calls use `localhost` with mapped ports
- Flag URLs that would fail due to Docker networking assumptions

**Health check validity** — For each service with a health check:
- Verify the health check endpoint actually exists in the application code
- Verify it returns the expected status code (usually 200) without requiring authentication
- Verify it doesn't depend on config or initialization that might not be complete during startup
- Flag health checks that test endpoints requiring auth or complex initialization

**Environment variable completeness** — For each service:
- Collect all `process.env.*`, `import.meta.env.*`, `os.environ[...]`, and equivalent references in the application code
- Verify each has a value source: docker-compose `environment` section, `.env` file, or a code-level default/fallback
- Flag any environment variable that is referenced in code but never set and has no default

---

### Category 6: Cross-Service Payload Contract Validation

For projects with multiple services that communicate over a network boundary (web → API, API → worker, service → service, BFF → microservices, mobile → backend), verify that the data contracts between caller and callee match on both sides. These mismatches compile cleanly and pass unit tests on each side in isolation, but fail at runtime when the services actually talk to each other.

**Request body shape matching** — For every HTTP call, RPC invocation, or message published by one service and consumed by another:
- Identify the request body construction on the caller side (the object being serialized and sent)
- Identify the request body parsing on the callee side (validation schema, DTO class, destructuring pattern, or `req.body` property access)
- Compare field names, types, required/optional status, and nesting structure
- Flag mismatches: renamed fields (`userName` vs `username`), missing required fields, extra fields that get silently dropped but were intended to be used, type mismatches (`string` vs `number` for IDs)

**Response body shape matching** — For every response returned by one service and consumed by another:
- Identify the response construction on the callee side (what the handler/controller actually returns)
- Identify the response consumption on the caller side (destructuring, property access, type assertions)
- Flag mismatches: the caller reads `response.data.items` but the API returns `response.items`, the caller expects an array but the API wraps it in a pagination envelope, the caller expects a flat object but the API nests it under a key

**Query parameter and path parameter contracts** — For URL-based communication:
- Verify query parameter names match between the caller's URL construction and the callee's parameter extraction
- Verify path parameter names and formats match (e.g., caller sends a UUID but callee parses as integer)
- Flag cases where the caller sends query params that the callee ignores (possibly a renamed or removed parameter)
- Flag cases where the callee requires query params that the caller never sends

**Header and auth token contracts** — For custom headers and authentication:
- Verify header names match exactly (case-insensitive for HTTP, but case-sensitive in many extraction patterns like `req.headers['X-Custom']` vs `req.headers['x-custom']`)
- Verify auth token formats match (Bearer token expected but API key sent, JWT expected but opaque token sent)
- Verify content-type expectations match (caller sends `application/json` but callee expects `multipart/form-data`, or vice versa)
- Flag services that expect headers set by an API gateway or reverse proxy that isn't present in all environments

**Shared type and DTO drift** — For projects that duplicate type definitions across services (rather than sharing a package):
- Identify types, interfaces, or schemas that represent the same data structure in multiple services
- Compare them for field-level drift: added fields in one service but not the other, type changes, renamed fields, different optional/required status
- Flag any drift that would cause a runtime mismatch
- Note: projects using a shared contract package (OpenAPI spec, protobuf, shared types package) are less prone to this, but verify the shared package is actually the version both services depend on

**Pagination contract consistency** — For paginated endpoints:
- Verify both sides agree on the pagination strategy (offset/limit, cursor-based, page/pageSize)
- Verify parameter names match (`page` vs `pageNumber`, `limit` vs `pageSize`, `cursor` vs `after`)
- Verify the response envelope matches (does the caller expect `totalCount`, `hasNextPage`, `nextCursor` where the API provides them?)
- Flag mixed pagination strategies within the same API surface

**Enum and constant value alignment** — For fields that use enumerated values:
- Identify enums or constant sets that appear on both sides of a service boundary (status codes, role names, event types, category values)
- Verify the values match exactly (case-sensitive: `"ACTIVE"` vs `"active"` vs `"Active"`)
- Flag values that exist on one side but not the other (new status added to API but frontend doesn't handle it, frontend sends a value the API rejects)

**Error response contract matching** — For error responses returned by one service and handled by another:
- Identify the error response shapes the callee produces (validation errors, auth errors, not-found errors, rate-limit errors)
- Identify how the caller parses and handles error responses (does it check `error.message`, `error.errors`, `error.details`, status codes?)
- Flag mismatches: caller expects `{ error: { message, code } }` but API returns `{ message, statusCode }`, caller checks for `422` but API returns `400` for validation errors
- Flag error response shapes that differ from the success response content-type or structure

---

### Integration Seam Report

After completing all checks, produce `INTEGRATION-SEAMS.md` with:
- A summary table of all findings by category and severity
- Detailed description of each finding with the specific files involved
- The exact assumption mismatch (what Component A expects vs what Component B provides)
- All findings also get rolled into the main `ISSUES.md` with the standard severity classification

---

## Phase 3: Layer Contract Validation

After verifying the project can start (Phase 2), verify that a request flowing through the full stack won't crash due to internal layer mismatches. Layer contract failures occur when one layer of the application accepts data at compile time (via generics, `any`, or loose interfaces) but a downstream layer enforces stricter rules at runtime (via type guards, instanceof checks, or schema validation). These bugs compile, pass lint, and survive unit tests, but throw when a real request flows end-to-end through middleware → handler → serializer.

Check each category below. Skip categories that don't apply to the project. Flag every issue found using the standard severity levels.

---

### Category 1: Response Format Contract Validation

If the application has a response serialization layer (JSON adapters, content negotiation, HAL/hypermedia formatters, Protocol Buffer marshaling), verify every controller/handler produces responses that satisfy the serializer's runtime contract.

**Generic response helpers** — Identify all response helper methods that accept generic or loosely-typed data (e.g., `success<T>(data: T)`, `respond(data: any)`, `send(body: unknown)`). For each:
- Trace what happens to `data` downstream — is it passed to a serializer, formatter, or adapter?
- Identify any runtime checks the downstream code performs (type guards, instanceof checks, property existence checks, schema validation)
- List every call site of the helper across all controllers/handlers
- Flag any call site where the data passed would fail the downstream runtime check

**Content negotiation consistency** — If the application supports multiple response formats (JSON, XML, HTML, HAL, etc.):
- Identify the runtime contract each format adapter enforces
- Flag inconsistencies between adapters (e.g., JSON adapter requires `_links` but XHTML adapter only requires `_links` OR `_embedded` — a response satisfying one may fail the other)
- Verify that every response produced by every controller satisfies ALL active adapters, not just the most commonly used one

**Error response format** — Verify that error responses also satisfy the content adapter contracts:
- Trace the error handling path (global error handler, error middleware, catch blocks)
- Verify the error response shape matches what the content adapters expect
- Flag error types that could be thrown but aren't handled by the error dispatcher (e.g., new error subclass added but error handler not updated)

---

### Category 2: Middleware / Decorator Chain Contracts

If the application uses middleware, decorators, or interceptors that modify requests or responses, verify every link in the chain produces output that satisfies the next link's expectations.

**Property injection contracts** — For each middleware or decorator that adds properties to the request or context object (e.g., `event.authContext = { ... }`, `req.user = ...`, `context.tenant = ...`):
- Identify the exact shape of the injected property
- Find all downstream code that reads this property
- Flag any consumer that accesses a sub-property that the injector doesn't guarantee (e.g., accessing `event.authContext.identity.role` when `identity` could be undefined)
- Flag any code path where the middleware might NOT run but downstream code assumes the property exists

**Argument shape assumptions** — For decorators that wrap method calls and access arguments positionally (e.g., `args[0] as ExtendedALBEvent`):
- Verify the cast matches the actual method signature
- Flag cases where a decorator is applied to a method with a different parameter order or type than expected
- Check for silent failures when the cast produces `undefined` properties

**Return value contracts** — For decorators that inspect or transform the return value (e.g., logging decorators that read `result.statusCode`):
- Verify every decorated method returns a value with the expected shape
- Flag methods where the return type is compatible at compile time but missing expected properties at runtime (e.g., returning `{ body: "" }` without `statusCode`)

---

### Category 3: Dependency Injection / IoC Runtime Contracts

If the project uses dependency injection or an IoC container, verify every resolution produces the expected type at runtime — not just at compile time. Cross-reference with Phase 2, Category 4 (IoC Container / DI Integrity) for infrastructure-level issues.

**Factory return type contracts** — For every factory function registered with the IoC container:
- Verify the factory actually returns the type it claims to provide (not a Promise of it, not a subtype missing required methods, not `undefined`)
- Cross-reference with Phase 2, Category 4 (async factory in sync container) if applicable
- Flag factories that return conditional types based on environment or config that might not match the consumer's expectations

**Auto-registration fallback** — If the IoC container silently auto-registers unbound types (creating instances without explicit configuration):
- Identify all types that are resolved but never explicitly bound
- Flag any auto-registered type whose constructor has parameters that won't be resolvable
- Flag any auto-registered type that should have been a singleton but will be transient by default

**Named injection consistency** — For every `@Inject("name")` or equivalent named binding:
- Verify a corresponding named registration exists (e.g., `container.bind(Type, { name: "name" })`)
- Verify the name strings match exactly (case-sensitive, no typos)
- Flag any named injection where the bound type doesn't match the parameter type annotation

**Decorator metadata dependency** — Cross-reference with Phase 2, Category 2 (Decorator metadata check):
- If the transpiler strips metadata, constructor parameter types resolve to `undefined`
- The container may silently auto-register `undefined` as a type, or throw an opaque error
- Flag the full chain: transpiler config → metadata availability → container resolution → injected value

---

### Category 4: Configuration / Schema Validation Chain Contracts

If the application loads configuration through a chain of stores (file, cache, composite, secrets manager, environment), verify that schema validation is applied consistently and that chain behaviors don't mask failures.

**Schema validation placement** — Trace the configuration loading chain (e.g., File → Cache → Composite → Application):
- Identify where schema validation occurs (which layer validates?)
- Flag chains where validation happens only at one layer but data could be injected or modified at another
- Flag cached values that are never re-validated after cache expiry (stale data could have been valid when cached but schema may have changed)

**Silent fallback masking** — For composite or fallback configuration stores:
- Identify cases where a validation failure in one store causes silent fallback to another
- Flag cases where the fallback store might return structurally different data (e.g., default values that miss required fields)
- Flag `try/catch` blocks that swallow configuration errors and substitute defaults

**Environment-specific schema gaps** — For configuration that varies by environment:
- Verify all environment-specific config files validate against the same schema
- Flag optional fields that are required in production but missing from dev configs (or vice versa)
- Flag schema fields with defaults that are only appropriate for one environment

---

### Category 5: Error Handling Dispatch Contracts

If the application has a centralized error handler that dispatches on error type, verify every throwable error is caught and handled with the correct status code and response format.

**Error class coverage** — For each error handler that dispatches on error type (instanceof, error codes, status properties):
- List every error class or error code that can be thrown anywhere in the application
- Verify each has a corresponding handler branch
- Flag any error class that falls through to the generic 500 handler when it should have specific handling
- Flag new error subclasses added to the codebase but not added to the handler's dispatch chain

**Error shape consistency** — For each error class:
- Verify the properties it carries (message, code, violations, metadata) match what the error handler reads
- Flag errors that extend a base class but don't call `super()` with the expected arguments
- Flag error handlers that access properties (e.g., `error.zodError.issues`) without null-checking

**Cross-layer error propagation** — Trace error paths across layers:
- Verify that errors thrown in service/repository layers are properly caught or propagated through middleware
- Flag cases where a middleware catches an error, wraps it, but loses the original error type (breaking downstream instanceof checks)
- Flag `catch (error)` blocks that re-throw a new `Error(error.message)` instead of the original typed error

---

### Category 6: Type System Escape Hatch Audit

Find every point where the type system is bypassed (`as any`, `as unknown`, unconstrained generics, dynamic property access) at a boundary between layers, and verify the runtime value matches the assumed type.

**Unsafe casts at layer boundaries** — Find every `as any`, `as unknown as T`, and unchecked type assertion at a point where data crosses from one layer to another:
- Trace what the actual runtime type is (from the producing layer)
- Compare to what the consuming layer assumes (from the cast)
- Flag mismatches where the cast hides a real type incompatibility

**Unconstrained generics in public APIs** — For generic methods/functions that are called by multiple layers:
- Determine if a type constraint should exist but doesn't (e.g., `success<T>` should be `success<T extends HalObject>`)
- Flag cases where adding the constraint would cause compile errors (indicating existing violations)

**Dynamic property access** — For code that uses bracket notation (`obj[key]`), `Object.keys()`, or `for...in` to access properties:
- Verify the dynamic keys correspond to real properties on the object
- Flag cases where dynamic access depends on a runtime convention (e.g., "properties not starting with `_`") that could silently break if naming conventions change

---

### Layer Contract Report

After completing all checks, produce `LAYER-CONTRACTS.md` with:
- A summary table of all findings by category and severity
- For each finding: the exact type signature that accepts the data (compile-time contract) and the exact runtime check that rejects it (runtime contract)
- The specific files and line numbers on both sides of the mismatch
- All findings also get rolled into the main `ISSUES.md` with the standard severity classification, tagged with their category (e.g., "ResponseFormat/Generic", "Middleware/PropertyInjection", "IoC/FactoryReturn")

---

## Phase 4: Build the Permutation Matrix

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

## Phase 5: Walkthrough

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

## Phase 6: Coverage Report

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

- **🔴 Critical**: Permission escalation paths, missing auth checks, broken core flows, integration seam failures that prevent startup, layer contract violations that crash on every request (e.g., every controller response fails serialization), cross-service payload mismatches that break core workflows (e.g., request body shape doesn't match validation schema, response envelope structure differs from what caller destructures)
- **🟡 Warning**: Inconsistent behavior, missing error handling, undocumented features, seam issues that fail under specific conditions, layer contract gaps that fail only for specific content types or error paths, payload mismatches that affect non-critical paths or degrade gracefully (e.g., extra fields silently dropped, pagination envelope differences)
- **🔵 Info**: Dead code, unreachable features, minor edge cases, seam inconsistencies that should be cleaned up, type system escape hatches that haven't manifested yet but could if code changes, shared type drift that hasn't caused a runtime failure yet but will if either side changes

Include all integration seam findings from Phase 2 and layer contract findings from Phase 3 alongside application-level issues. Tag each issue with its source category (e.g., "Dockerfile/COPY", "Transpiler/Metadata", "Config/Coverage", "CrossService/RequestBody", "CrossService/ResponseShape", "CrossService/SharedTypeDrift", "CrossService/EnumAlignment", "ResponseFormat/Generic", "Middleware/PropertyInjection", "IoC/FactoryReturn").

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
├── INTEGRATION-SEAMS.md    # Cross-boundary validation findings (Phase 2)
├── LAYER-CONTRACTS.md      # Intra-service layer contract findings (Phase 3)
├── WALKTHROUGH.md          # The complete narrated walkthrough
├── PERMISSION-MATRIX.md    # Role × Action matrix table
└── ISSUES.md               # All issues found, categorized by severity (includes seam and layer contract issues)
```

If the project is large, split the walkthrough by lifecycle stage:

```
emulation-report/
├── SUMMARY.md
├── DISCOVERY.md
├── INTEGRATION-SEAMS.md
├── LAYER-CONTRACTS.md
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
