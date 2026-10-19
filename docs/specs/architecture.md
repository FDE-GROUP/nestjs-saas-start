# Project Architecture

> 受众: **人 + Agent**（`读者: Agent`——结构契约，须遵循）

## Core Design Principles

- **Hexagonal / Clean Architecture** (same dependency rule): ports & adapters with a strict inward direction (`api → application → domain ← infrastructure`); the domain depends on nothing but the shared kernel (enforced by the core purity guard test).
- **Functional core, imperative shell** (architecture precision amendment, 2026-10-20): domain decisions are pure functions over immutable data returning result-unions (reference: `canTransition`). Aggregate-first tactical DDD is **not** adopted (the only natural aggregate — User — has its lifecycle owned by Better Auth; the dead pipeline was removed). Value objects on demand (only `Quota` in this domain).
- **CQRS on demand (P4)**: contexts with cross-aggregate orchestration / transaction boundaries / event publishing use `Command/Query → Handler` (`@nestjs/cqrs`); simple contexts (controller + service + repository) are a **legal end state**, not unfinished work (e.g. users/posts/workspaces).
- **Vertical slices**: contexts are packaged by feature (`apps/api/src/modules/<context>`; shared-contract contexts live under `libs/core/src/modules/<context>`), not by technical tier. Cross-context coupling only happens through domain events, never by importing another context's `domain/` or `infrastructure/`.
- **Event Sourcing (committed, phased)**: confirmed architectural goal (human clarification 2026-10-14) — no longer gated on "a context actually needs it", while phasing and audit/migration gates stand. Phase B shadow-append is current (event-table audit; CRUD remains the single source of truth). Events are published from the service/handler layer (P3 — "operation record" semantics; the aggregate event pipeline was removed in S1). **Phase C (projections/sagas) is downgraded to a trigger-criteria-driven optional evolution** — default end state = audit log + integration events. See [event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md).
- **EDA (event-driven architecture, committed)**: domain events are the **only** cross-context integration mechanism; evolution path = in-process dispatch (landed) → transactional outbox for durable publish (Phase B) → cross-process broker subscription (only after microservice triggers fire, see [microservice-readiness.md](../plans/microservice-readiness.md)).

## Directory Structure

> **Logical view.** The tree below is the merged layer taxonomy, **not** a single `apps/api/src` directory: several folders shown here (`shared-kernel/`, `tenancy/`, `authorization/`, `platform/`, and the `domain/`+`application/` of `subscriptions`/`workspaces`/`tenants`) physically live in `libs/core`. Their precise placement across the two backend packages is defined in **§Two-package physical layout** below.

```
src/
├── app.module.ts            # Root module (imports shared infra + feature contexts)
├── main.ts                  # Bootstrap: Fastify, StandardSchemaValidationPipe, Swagger, versioning
├── shared-kernel/           # Cross-context primitives
│   ├── domain/              #   AggregateRoot, DomainEvent (pure, framework-free)
│   └── cqrs/types.ts        #   BaseCommand / BaseQuery over @nestjs/cqrs
├── modules/                 # Bounded contexts (vertical slices)
│   ├── users/               # ★ Reference implementation of the full pattern
│   │   ├── domain/          #   entities/ value-objects/ events/ repositories/ (ports)
│   │   ├── application/     #   commands/ queries/ read-models/ (handlers)
│   │   ├── infrastructure/  #   MikroORM repository adapter, mappers, event dispatcher
│   │   ├── api/             #   controller + DTOs (HTTP transport)
│   │   └── users.module.ts  #   wires CqrsModule + handlers + port→adapter binding
│   ├── auth/                # Authentication (constitution name; Better Auth adapter: credentials/session/factors/OAuth · membership data only)
│   ├── authorization/       # Authorization supporting domain: roles/grants/adjudication/audit · two scope layers (tenant + platform)
│   ├── tenants/             # Tenant/organization core domain: lifecycle/members/invitations + deny-list status machine (tenant/user status) + governance handlers
│   ├── platform/            # Platform-governance facade: operator gate/audit/identity+settings ports (no owned tables)
│   ├── workspaces/          # In-tenant resource partitioning (an authorization subject; NOT a second isolation wall)
│   ├── posts/               # Content context
│   ├── subscriptions/       # Tenant subscription/quota context
│   ├── payment/             # Payment context
│   └── storage/             # Cloud storage context (S3/OSS/COS)
├── tenancy/                 # Cross-cutting multi-tenancy MECHANISM layer (not a business context): ALS tenant
│                            #   context + TenantScopeGuard + middleware + exempt/public; session adapters
│                            #   (deny-list status machine relocated to `tenants`, seat quota to `subscriptions` —
│                            #   open item 4 landed); CONSUMES authorization's ruling ports
├── database/                # Global infra: MikroORM client, entities, migrations, seed
├── config/                  # Global infra: typed config + zod validation
├── logger/  mailer/  common/  i18n/   # Cross-cutting infrastructure
```

### Two-package physical layout

`libs/core` is a **layered, reusable SaaS-domain kit (`@core/saas-kit`)** — explicitly **not** a DDD "shared kernel": the `shared-kernel/` folder is only its innermost primitive sub-layer, while the kit additionally ships cross-context contracts and the domain + application layers of reusable SaaS contexts. The logical tree above maps onto the two backend packages as:

```
libs/core   (@core/saas-kit)                 # the kit — framework-light, portable, contains NO infrastructure
├── shared-kernel/                           # L0 tactical primitives (domain/cqrs/context/errors/util)
├── tenancy/  authorization/  platform/      # L1 cross-context mechanism + published contracts/ports
└── modules/{subscriptions,workspaces,tenants}
                                             # L2 shipped contexts: domain/ (entities + repository PORTS) + application/ (CQRS handlers) — ports only

apps/api                                     # the reference application — all concretions live here
├── modules/<ctx>/{api,infrastructure}       # HTTP controllers + MikroORM adapters that BIND core ports (ports→adapters)
├── database/  config/  main.ts  app.module.ts   # global infra + DI composition root
└── modules/{users,auth,posts,payment,storage}   # full local vertical slices (domain→application→infrastructure→api)

apps/web            # deployable frontend shell (React + Vite) — F0
packages/api-client # exchangeable typed client generated from openapi.yaml (F1)
```

**Boundary invariants (the real red line — held by `fallow` + the per-layer import matrix below):**
1. `libs/core`, at any layer, contains **no** infrastructure / ORM (`@mikro-orm`) / HTTP (controllers, DTOs) concretions — ports live in core, adapters in apps.
2. Dependency direction is always `apps → core`; `libs/core` never imports from `apps/*`.
3. Consumers (apps/api) only perform `ports → adapters` binding + HTTP/wiring.

A "layer shift" is a violation **only** when concretions are pushed into `libs/core` (e.g. a MikroORM entity under `modules/*/domain`); shipping domain + application layers inside the kit is by design, not a violation. Naming is frozen: neither the `@core/saas-kit` package nor the `shared-kernel/` sub-layer will be renamed (large blast radius on inbound imports, zero structural gain — the kit/kernel distinction is now documented, not encoded in folder names). See the ruling: [module-core-position-kernel-vs-kit](../plans/module-core-position-kernel-vs-kit.md).

## The `users` Context (reference flow)

```
POST /users
  → UsersController (api)                 # builds CreateUserCommand from validated DTO
  → CommandBus.execute                    # @nestjs/cqrs
  → CreateUserCommandHandler (application)
        repo.findByEmail → ConflictException if exists
        User.register(...) (domain)       # invariants + recordEvent(UserRegisteredEvent)
        repo.save(user)  (port → MikroUserRepository in infrastructure)
        eventBus.publishAll(user.pullDomainEvents())   # in-process today, event store later
  → returns PublicUser projection (201)
```

Reads (`GET /users`, `GET /users/:id`) use `Query` handlers that read the write store
directly via `MikroOrmService` (pragmatic CQRS read side, bypasses the domain).

## Layer Dependency Rules

| Layer | May import | Must NOT import |
|-------|-----------|-----------------|
| `domain/` | `shared-kernel/domain`, other files in same domain | Nest, MikroORM, DTOs, HTTP, other contexts |
| `application/` | `domain`, `shared-kernel/cqrs`, `@nestjs/cqrs`/common | other contexts' `domain`/`infrastructure` |
| `infrastructure/` | `domain` (ports), MikroORM, Nest | — (it is the adapter boundary) |
| `api/` | `application` (commands/queries), DTOs | `domain` entities used as transport |

Domain purity is guarded by the **fallow architecture-boundary advisory** in `pnpm run ci`
(`scripts/ci.ts`, non-blocking; its findings require a second human check per
[tooling-standards.md §4.7](./tooling-standards.md)). There is **no** test that scans
`apps/api/src/modules/users/domain/**` for `@nestjs/*`, `@mikro-orm/*` or `@app/database`
imports — layer direction is additionally held by the per-layer import matrix above and by
code review.

## Bounded Context Map & the Multi-Tenancy Mechanism Layer

Terminology discipline: a **tenant** is a business concept (the `tenants` core-domain
aggregate, with lifecycle, invariants and language); **multi-tenancy** is an isolation
mechanism (infrastructure, no aggregate, no lifecycle: request recognition → ALS
propagation → boundary enforcement → exemption axis). The two never co-inhabit:
`tenancy/` hosts no tenant-aggregate business writes, and business contexts never
re-implement isolation. `tenancy/` consumes `authorization` ruling ports; it no longer
houses the CASL checker (slice A) or platform governance (slice D).

Context identities fixed by the domain-refactor plan (global-domain-context-refactor):
`authorization` is an **independent supporting domain** serving both `tenants` (members
carry role keys) and `platform` (operator gate) — never a tenants sub-domain; `platform`
is a **governance facade without aggregates** (tenant lifecycle write capability stays
in `tenants`, invoked via the CQRS bus); workspace is a partition inside a tenant, an
authorization *subject*, not a role scope. Cross-context references stay weakly coupled:
role keys and foreign ids are plain string columns (no cross-context ORM relations), and
contexts meet only through published ports (e.g. `ROLE_ASSIGNABILITY_READER`).

The three-layer permission chain: `PlatformOperatorGuard` (platform layer) →
`TenantScopeGuard`/ALS (tenant isolation) → `TenantPermissionGuard` + `@Can`
(tenant layer + instance-level conditions).

## Cross-Context Communication

Contexts never import each other's internals. Side effects that span contexts are
expressed as domain events subscribed via `@EventsHandler`. `auth`, `stripe` and
`storage` stay thin adapters/glue (a legal P4 end state); should a context develop
real aggregate needs later, that goes through a trigger-criteria-gated plan (no
more "designated slots").

## Context Boundary: Authentication ↔ Users

`authentication` (constitution name; current directory `modules/auth`) asserts **who you
are**: credentials, sessions, factors, OAuth channels — the Better Auth adapter plane, with
`session-resolver.ts` as the single per-request session resolution surface. `users` owns the
**identity subject**: profile aggregate + PIPL self-service — slow-changing and compliance-sensitive.

Table ownership (SSOT: `apps/api/src/database/table-ownership.ts`): `user` → **users**;
`account`/`session`/`verification` → **authentication**. The seam between the two contexts is
the user↔member relation: `member` (user × organization) is a joining entity of `tenants` —
roles attach to the member, never to the global user, so the same user may hold different
roles in different tenants.

Governance hooks mounted on the authentication plane (`seats-quota.hook.ts`) are transport
glue at the Better Auth mount point; the seat ruling itself lives in the subscriptions
context's quota domain policy (core `modules/subscriptions/quota`, `QuotaService`) — a
mounting location must not be read as ownership.

## Constant Contract Placement

A constant's home is decided by its **qualification as a contract**, not by reuse count:

1. **Contract-qualified**: any constant read across context boundaries, process boundaries
   (HTTP responses / event envelopes), or the durability stream (outbox/relay) must live in
   the contract dictionary layer — event names in `DOMAIN_EVENTS`, business error codes in
   `ERROR_CODES`—single-sourced literals, each **bidirectionally locked** by its mechanism
   (rehydration registry / error-code response tests). New constants of this class always
   go into the dictionary first.
2. **Context-owned enums**: domain state-machine enums (`TENANT_STATUS`, `SUBSCRIPTION_STATUS`,
   PLANS, etc.) stay inside their **owning context**; if the enum is part of an event payload,
   it cohabits with the event class under the producing context on the core side (consumers
   importing it are importing the contract itself—legitimate). Never hoist them into any
   global hub in the name of centralization.
3. **Non-contract constants stay out**: result-object literals and read-model internal shapes
   (`as const` implementation details) do not become contracts by virtue of reuse—no
   centralizing, no promoting.

Corollary: **no global `constants/` hub** (every context evolution would have to touch the
hub = a cross-cutting god module, violating vertical slices); anti-scattering is enforced by
mechanism (single-source dictionaries + lock tests + relay rejecting unknown types), not by
directory centralization.

## Tech Stack

- **Runtime**: Node LTS ≥22 (ESM, `"type": "module"`) + pnpm (package manager)
- **Framework**: NestJS 12 + Fastify
- **Architecture**: Clean Architecture + DDD + CQRS (`@nestjs/cqrs`)
- **Database**: PostgreSQL + MikroORM (explicit migrations)
- **Authentication**: Better Auth (**pure auth & membership data source**: identity/session/organization·member·invitation tables; its built-in org authorization HTTP endpoints are sealed (module-rbac-casl ruling A), member/invitation endpoints served by our own facades via server-side calls)
- **Authorization**: CASL (`@casl/ability` v7) — the sole tenant-level RBAC ruling engine. **The authorization-fact SSOT lives in DB grant rows** (`tenant_role`/`tenant_role_grant`·per-tenant dynamic roles·module-rbac-dynamic-roles ruling C supersedes the old "`tenant-rules` TS table is the SSOT" ruling); **the code vocabulary `tenant-rules` is the language SSOT** (compile-time `TenantSubject/TenantAction` type domain only); **CASL rules are the runtime projection** (the checker lazily projects per-tenant via the repository port + in-process version cache·`invalidateTenant` for hot reload). Endpoints declare `@Can(action, subject)` and `TenantPermissionGuard` rules from an ALS-preinjected role (no scattered special-casing); instance-level authorization runs at check level (`TenantPermissionCheck.resource` + condition rows matched by CASL mongo after resolving the `{{userId}}` template); query-level list filtering is its same-source extension (`TenantPermissionChecker.listPredicate` pushes restricted grant rows down into the list read chain as an instance predicate merged with the tenant filter under a fixed spread order·module-rbac-query-level-filtering)
- **Testing**: Vitest (+ `unplugin-swc` for decorator metadata)
- **Linting/Formatting**: Biome
- **Frontend (adopted 2026-10-17, phased per [global-frontend-adoption](../plans/global-frontend-adoption.md))**: React 19 + Vite 8 + TanStack Router + Tailwind CSS 4 with shadcn-style on-demand primitives (cva/clsx/tailwind-merge/lucide/sonner); same repo & workspace, dev-time same-origin reverse proxy (vite proxy → :7009, no CORS). The typed consumption surface is `packages/api-client`, generated from the OpenAPI contract. **No reverse penetration**: the backend never depends on frontend artifacts; Biome/pnpm/Vitest tooling standards apply unchanged.

## Validation Note

Controllers validate via the **official standard-schema path** (`@Body/@Param/@Query({ schema })`)
and serialize via `@SerializeOptions({ schema })`; the zod schema **must be imported by value**
(not `import type`) so the parameter decorator can read it — otherwise validation/serialization is
silently skipped. The shared request/response schemas live in `@saas/contracts` (single source).
`biome.json` keeps a `useImportType` override on the relevant files to disable the auto-fix that
would rewrite these value imports back to `import type`. (class-validator / class-transformer / Joi
were retired by the global-validation-zod constitution amendment — see tooling-standards §3.)

## Pagination Contract

Two envelopes live in `shared-kernel/domain/pagination.ts` (pure, framework-free) and are the
only sanctioned list-result shapes — build list endpoints on them, never ad-hoc `{rows, count}`:

- **`CursorPage<T>` (`items` + `hasMore` + optional opaque `nextCursor`) is the DEFAULT for new
  list endpoints.** It is keyset pagination over a deterministic total order — the reference
  binding is `(createdAt DESC, id DESC)` (id is the unique tiebreaker for same-timestamp rows) —
  so it stays correct and index-friendly as data grows, with no `OFFSET` scan. The cursor is an
  opaque base64url of the sort key: it hides storage internals and is **not** an authorization
  substitute (tenancy guards still run). Malformed cursors are a 400, surfaced by the adapter's
  `decodeCursor`, after the DTO has already gated the character set.
- **`Page<T>` (offset: `items` + `total` + echoed `limit`/`offset`) is the exception**, retained
  for admin/governance surfaces that need a total count or arbitrary-page jump. It is not
  removed; migrating an offset endpoint to cursor is a deliberate, per-endpoint breaking change.

Both are constructed only via `createPage` / `createCursorPage` (the single shape-discipline point,
which shallow-copies `items`). Requests enter through `ListPageDto` / `ListCursorDto` on the API
side and reach the port as `PageRequest` / `CursorPageRequest`.

## Deployment

- **Development**: Node + pnpm + Docker PostgreSQL (`docker-compose.dev.yml`)
- **Production**: Docker Compose (Application + PostgreSQL)
- **Docs**: Swagger/OpenAPI auto-generation (`/docs`)

## Appendix: Table Ownership Discipline

> Introduced by the microservice-readiness initial slice (2026-10-14). The machine-readable
> owner list is the single source of truth in `apps/api/src/database/table-ownership.ts`;
> this appendix states the semantics only — never copy the list here.

- **Strict on the write side**: any `insert/update/delete` target table must belong to the
  bounded context owning the file (`modules/<ctx>/**`; `tenancy/**` counts as `tenants`).
  Enforced in CI by `table-ownership.guard.test.ts` (grep-level scan, no AST toolchain).
- **Lenient on the read side**: cross-context `select/join` is allowed and is the natural
  shape of CQRS read-models / governance statistics; it is governed by file placement
  (read-models) and audit, not by the guard.
- **Cross-context FKs** may only point at auth-core tables (aligns with the S2 repository
  chokepoint convention).
- **Declared exceptions only**: every legitimate write-side crossing must appear in
  `WRITE_EXCEPTIONS` with a reason and plan attribution; the guard fails on stale
  (unconsumed) exceptions, so no silent exemptions accrue.
- **New tables** must be registered in `table-ownership.ts` (owner set) as part of the
  migration change, reviewed at the audit gate. The `event` table is owned by the
  `database` infrastructure (ES port exclusive writes); business repositories must never
  append to it directly.
