# Project Architecture

> 受众: **人 + Agent**（`读者: Agent`——结构契约，须遵循）

## Core Design Principles

> **Positioning — Four Pillars (宪法定位 · 2026-10-21 人澄清并成文；每句均映射到既有强制机制，不作姿态性宣称):**
> 1. **Clean Architecture is the floor** — the dependency rule is executable infrastructure, not a slogan: core-purity guard (DI minimal surface + zero HTTP inside core), table-ownership guard (ledger↔path full identity), fallow 0 boundary violations, OpenAPI three-way drift gate, Entity Column Law identity. Details in the bullets + §Appendix below.
> 2. **DDD taken in proportion** — the strategic layer (bounded contexts, event-based cross-context integration) is fully kept; the tactical layer is trimmed by recorded cost/benefit judgments (aggregate-first + full-cover CQRS were removed; state machines / `Quota` VO / projection doctrine grew back by adjudication). Judgments are on the record — see `functional-core.md` and the P2/P4 bullets below.
> 3. **Functional-core three-mapping is the breakthrough** — the consistency target is a **projection** `domain-state ⊆ (data-entity ≡ table)` (not a naive 1:1), enforced by a triple (migration-diff + Column Law / pure total `fromRow` single seam / compile-time `PostState↔PostEntity` structural lock in `infrastructure/`). Each part has precedent; the guard-enforced unification interlocked with the functional core is this repo's **engineering synthesis** (not academic novelty). See the Projection-Mapping Doctrine below.
> 4. **CQRS/ES/EDA on demand but capability-ready** — the capability baseline is fully provided (per-context knobs, optimistic lock, bootstrap + `--verify` reconciliation, replay read-side, truth-source flip runbook); activation is decided per module. The law is **"enabled = committed, default = shadow"** — "non-mandatory" must not be misread against the already-committed truth-source contexts. See the CQRS / ES / EDA bullets below.

> The enforceable statements follow; this block is the identity summary, pointers only (single source stays in the bullets + the linked guards/plans).

> **Functional Core (P1) — reading map (navigation index · pointers only, adds no rule):** the P1 doctrine is intentionally distributed across this doc; read these together (each facet's single source stays where it is):
> - **Identity** — Positioning Four Pillars #3 (above).
> - **Core statement (P1)** — bullet "Functional core, imperative shell" below.
> - **Entity consistency** — bullet "Projection-Mapping Doctrine" below + [Entity Doctrine](#entity-doctrine-domain-entity-vs-data-entity).
> - **Physical map** — "Functional-core inventory" subsection below.
> - **Full exposition (non-normative)** — [functional-core.md](../functional-core.md).

- **Clean Architecture** (dependency rule — also known as Hexagonal): a strict inward direction (`api → application → domain ← infrastructure`), realized at the domain boundary through **ports & adapters**; the domain depends on nothing but the shared kernel (enforced by the core purity guard test).
- **Functional core, imperative shell** (architecture precision amendment, 2026-10-20): domain decisions are pure functions over immutable data returning result-unions (reference: `canTransition`). Aggregate-first tactical DDD is **not** adopted (the only natural aggregate — User — has its lifecycle owned by Better Auth; the dead pipeline was removed). Value objects on demand (only `Quota` in this domain).
- **Projection-Mapping Doctrine (FC entity consistency · core principle, codified 2026-10-21, human sign-off)**: the consistency target between a **domain entity** ↔ its **data entity** ↔ the physical **table** is **not** a naive 1:1 equality — Evans-style aggregate roots inherently break that (object graphs, value objects, storage-only columns, local identity). Under the functional core the target is a **projection**: `domain-state ⊆ (data-entity ≡ table)`, enforced by a triple — (1) *data-entity ≡ table* via `migration:generate` diff + schema/metadata consistency e2e + the Entity Column Law guard (already in place); (2) a **pure total mapper** `fromRow` (data-entity → domain restore) as the single mapping seam in the repository adapter; (3) a **compile-time structural lock** between the domain persisted-state contract (`PostState`) and the data-entity interface (`PostEntity`), living in `infrastructure/` — **never `domain/`**, which must not import `infrastructure/`. Storage-only columns (optimistic-lock `version`, FK, discriminator) are on the whitelist: read by the mapper, **not** mirrored into domain-state. For real aggregates the same law holds per granularity (table-per-aggregate or table-per-entity — each entity ↔ its own table, value objects embedded). Reference implementation: `posts`; other persistence contexts are **pending** via their own audited plans. See the [Entity Doctrine](#entity-doctrine-domain-entity-vs-data-entity) below and [module-posts-fc-projection-doctrine.md](../plans/module-posts-fc-projection-doctrine.md).
- **CQRS on demand (P4)**: contexts with cross-aggregate orchestration / transaction boundaries / event publishing use `Command/Query → Handler` (`@nestjs/cqrs`); simple contexts may call `application/*.service.ts` directly instead of adding handlers — **what is a "legal end state" is only the optionality of CQRS handlers, never the layering itself**. Every bounded context MUST still present the four-layer vertical slice `domain/application/infrastructure/api`; `domain/` carries the real business rules (policies / value objects / ports) even for outbound-gateway contexts (channel selection & degradation, upload validation, money & currency, object-key naming). The capability baseline is mandatory while adoption is per-module (same rule for ES/EDA, see below); real handler examples: organizations governance commands, users delete/export.
- **Use Cases layer = `application/`** (terminology coordinate, codified 2026-10-21): the Clean Architecture cone's second ring "Use Cases" is **not** a separate `usecases/` folder nor a `XxxUseCase`/`XxxInteractor` suffix here — it **is** the `application/` layer of each vertical slice, materialized through two recognized industry conventions, both legal end-states per P4 above: (a) **CQRS handler-per-use-case** (`Command/Query → Handler` via `@nestjs/cqrs`; used by `posts`/`organizations`/`users` — the NestJS-aligned mainstream form), and (b) **imperative application service** (each public method of `application/<context>.service.ts` is a use case; used by the outbound-gateway contexts `payment`/`storage` — the DDD/Vernon application-service form). We **deliberately do not** add a third `usecases/` directory or `XxxUseCase` naming: it would duplicate handler/service semantics and diverge from the `@nestjs/cqrs` convention. The layer (a Use Cases layer exists) is mandatory; materializing each use case as a standalone handler class is per-context optional.
- **Handler vs service — selection rule** (P4 refinement · each context keeps **one spine**, no per-call mixing — verified across all 8 contexts): use the **CQRS handler spine** when a use case needs cross-aggregate orchestration, an explicit transaction/UoW boundary, domain-event publishing, or a per-message pipeline/hook point (guards, idempotency, replay), or when command/query contracts are worth dispatching separately — today: `users`/`posts`/`organizations`/`workspaces`/`subscriptions`. Use the **imperative application-service spine** when the context is thin orchestration or an **outbound gateway** — a single side-effect path with no aggregate graph, where per-use-case command+handler+registrar ceremony adds no value — today: `payment`/`storage` (+ the command-light support context `authorization`). Both are legal end-states; a service spine may be **upgraded to handlers** when handler-type needs emerge (capability baseline mandatory, adoption per-module).
- **Vertical slices**: contexts are packaged by feature (`apps/api/src/modules/<context>`; shared-contract contexts live under `libs/core/src/modules/<context>`), not by technical tier. Cross-context coupling only happens through domain events, never by importing another context's `domain/` or `infrastructure/`.
- **Event Sourcing (capability baseline · per-module adoption · phased)**: confirmed architectural goal (human clarification 2026-10-14; truth-source re-direction + capability/implementation separation, human 2026-10-20, supersedes the "Phase C optional / CRUD-as-default-end-state" wording of the 2026-10-20 precision amendment — see [module-es-truth-source-amendment.md](../plans/module-es-truth-source-amendment.md)). The architecture **must fully provide** CQRS/ES/EDA capabilities (ports, mechanism, reference demo); **adoption is decided per business module** on real needs — for eventized aggregates the event store is the single source of truth ("replay = truth", read tables are rebuildable projections); simple-CRUD / stateless data (sessions, verification, memberships…) may **legally remain CRUD forever**. Landed today: shadow-append + transactional outbox + relay (`EVENT_PUBLISH_MODE: inproc|shadow|outbox`, default inproc); events are published from service/handler layer (P3 — "operation record" semantics; the aggregate event pipeline was removed in S1). Replay-as-truth is proven **per-module**: the `subscriptions` lifecycle is today's sole truth-source demonstration, while organization/user governance has been **demoted to audit/integration events only** — the `ES_TRUTH_SOURCE_TENANTS` knob was retired with the governance ES overlay per the 2026-10-23 governance-lifecycle consolidation ([global-governance-lifecycle-consolidation.md](../plans/global-governance-lifecycle-consolidation.md)). See [event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md).
- **EDA (event-driven architecture, committed)**: domain events are the **only** cross-context integration mechanism; evolution path = in-process dispatch (landed) → transactional outbox for durable publish (Phase B) → cross-process broker subscription (only after microservice triggers fire, see [microservice-readiness.md](../plans/microservice-readiness.md)).

### Paradigm Deviations — confirmed exceptions register (human-approved · pointers only)

The vertical-slice + DDD/functional-core paradigm in §Core Design Principles is the **rule**. Wherever a context intentionally departs from that shape, it is recorded here as a **developer-confirmed exception** (not structural debt): misreading a confirmed exception as debt — or letting undeclared drift borrow an exception's cover — is exactly what this register prevents. The table is a **pointer only**; each row's authoritative detail stays in its linked section and this register adds no new rule.

| # | Subject | Deviation from the standard four-layer shape | Cause (locked tool) | Status · authority |
|---|---------|----------------------------------------------|---------------------|--------------------|
| D1 | `auth` | No self-owned aggregates/policies · **no `application/` spine**; `domain/` holds **only the published `AUTH_*_STORE` ports**, remaining content placed by layer under `infrastructure/` + `api/` | **Better Auth** (permanently locked) owns authentication semantics | Permanent · developer-confirmed — §Layer-shape |
| D2 | `platform` | No `domain/` entities — a governance facade with **no physical table of its own** | Data owned by `organizations`/`users` | Permanent · developer-confirmed — §Layer-shape |
| D3 | `authorization` | **Four-layer shape is compliant (no shape deviation)** — the exception is that RBAC *ruling* is delegated to an **external CASL engine** (grant facts live in DB rows, CASL rules are a runtime projection) and authorization is dual-natured (ruling machinery = mechanism, management face = supporting domain) | **CASL (`@casl/ability`)** supplies the ability language; *the library constrains the interface, the domain owns the facts* | Permanent · developer-confirmed — §Mechanism Layer vs Business Domain · §Tech Stack (Authorization) |
| D4 | tactical DDD (paradigm-level) | Aggregate-first tactical DDD is **not adopted**; the one natural aggregate (User) has its lifecycle owned by Better Auth | Better Auth owns the user lifecycle | Permanent — §Core Design Principles (functional-core bullet) |

> **Non-deviations clarified**: `payment`/`storage` are outbound-gateway contexts that **still present the full four-layer slice** (domain policies + application + infrastructure + api) — a paradigm *variant*, not a deviation. Likewise `organizations` is **not a layer-shape deviation but a cross-package placement nuance**: it is a full apps-local vertical slice whose only shared pure lifecycle kernel is carved into `libs/core/…/organizations/lifecycle` as a P1 functional-core piece (distinct from the D1–D4 layer-shape exceptions).

### Functional-core inventory (physical map of P1 · precision amendment addendum)

P1 is a pattern, not a folder — kernel pieces live across contexts. Admission criteria: **provable purity** (zero imports, or vocabulary/self-owned VO only) + **driven by the shell** (load → decide → write inside a UoW). Purity is enforced by `libs/core/src/core-purity.test.ts` (dual lock: `@nestjs/common` imports ⊆ DI minimal surface + zero `HttpException/HttpStatus`). New decisions follow this shape:

| Kernel piece | Responsibility | Purity |
|---|---|---|
| `core/modules/organizations/lifecycle/organization-lifecycle.ts` | Shared organization/**user** state-machine transition table + `canTransition` (result-union · reference sample) | zero imports |
| `core/authorization/instance-predicate.ts` | RBAC query-level predicate grammar → DB predicate compilation | zero imports |
| `apps/api …/authorization/domain/policies/rbac.policy.ts` | Role key/conditions policy gates | vocabulary only |
| `core/modules/subscriptions/quota/organization-plans.ts` | Plan catalog + `resolvePlanDef` | self-owned VO only |
| `core/modules/subscriptions/quota/quota.vo.ts` | Quota non-negative-integer invariant (the single P2 VO) | zero imports |

> Full exposition (concepts, criteria, recipe, FAQ) lives in the [functional-core guide](../functional-core.md) (expository, non-normative).
> Its small size (a few hundred lines total) reflects **the domain's truth**, not a gap: complexity lives in the technical architecture of isolation/governance/quota, not in business-rule density — most code is shell (ports/adapters/guards/UoW). For kernel reuse see `user-status.service` reusing `canTransition` directly (one table serving two lifecycles).

## Directory Structure

> **Logical view.** The tree below is the merged layer taxonomy, **not** a single `apps/api/src` directory: several folders shown here (`shared-kernel/`, `tenant-isolation/`, `authorization/`, `platform/`, and the `domain/`+`application/` of `subscriptions`/`workspaces`) physically live in `libs/core` (`organizations`, by contrast, is a **full apps-local vertical slice** — only its shared pure state-machine kernel `libs/core/modules/organizations/lifecycle/organization-lifecycle.ts` is carved into the kit as a P1 functional-core piece, **not** a layer split). Their precise placement across the two backend packages is defined in **§Two-package physical layout** below.

```
src/
├── app.module.ts            # Root module (imports shared infra + feature contexts)
├── main.ts                  # Bootstrap: Fastify, StandardSchemaValidationPipe, Swagger, versioning
├── shared-kernel/           # Cross-context primitives
│   ├── domain/              #   AggregateRoot, DomainEvent (pure, framework-free)
│   └── cqrs/types.ts        #   BaseCommand / BaseQuery over @nestjs/cqrs
├── modules/                 # Bounded contexts (vertical slices)
│   ├── users/               # ★ Reference implementation of the full pattern
│   │   ├── domain/          #   entities/ value-objects/ events/ repositories/ ports/ policies/ constants/
│   │   ├── application/     #   commands/ queries/ read-models/ (handlers) · imperative services · = CA "Use Cases" layer
│   │   ├── infrastructure/  #   MikroORM repository adapter, mappers, event dispatcher
│   │   ├── api/             #   controller + DTOs (HTTP transport)
│   │   └── users.module.ts  #   wires CqrsModule + handlers + port→adapter binding
│   ├── auth/                # Authentication (constitution name; Better Auth adapter: credentials/session/factors/OAuth · membership data only)
│   ├── authorization/       # Authorization supporting domain: roles/grants/adjudication/audit · two scope layers (organization + platform)
│   ├── organizations/       # Organization core domain: lifecycle/members/invitations + deny-list status machine (organization/user status) + governance handlers
│   ├── platform/            # Platform-governance facade: operator gate/audit/identity+settings ports (no owned tables)
│   ├── workspaces/          # In-organization resource partitioning (an authorization subject; NOT a second isolation wall)
│   ├── posts/               # Content context
│   ├── subscriptions/       # Organization subscription/quota context
│   ├── payment/             # Payment context
│   └── storage/             # Cloud storage context (S3/OSS/COS)
├── tenant-isolation/        # Cross-cutting multi-tenancy MECHANISM layer (not a business context): ALS
│                            #   organization context + TenantIsolationGuard + middleware + exempt/public; session adapters
│                            #   (deny-list status machine relocated to `organizations`, seat quota to `subscriptions` —
│                            #   open item 4 landed); CONSUMES authorization's ruling ports
├── database/                # Global infra: MikroORM client, migrations (DDL SSOT), seed, eventing/ (ES infra); BA
│                            #   entities re-homed by domain (identity machinery → auth/infrastructure/entities, org
│                            #   container → organizations likewise; shapes constrained by the BA interface contract —
│                            #   global-ba-entity-domain-placement · both families landed, `database/ba/` dissolved),
│                            #   migrations, seed, eventing/ (ES store/relay/UoW). Context-owned table entities live in
│                            #   modules/<ctx>/infrastructure/entities (owner SSOT: database/table-ownership.ts)
├── config/                  # Global infra: typed config + zod validation
├── logger/  mailer/  common/  i18n/   # Cross-cutting infrastructure
```

### Two-package physical layout

`libs/core` is a **layered, reusable SaaS-domain kit (`@core/saas-kit`)** — explicitly **not** a DDD "shared kernel": the `shared-kernel/` folder is only its innermost primitive sub-layer, while the kit additionally ships cross-context contracts and the domain + application layers of reusable SaaS contexts. The logical tree above maps onto the two backend packages as:

```
libs/core   (@core/saas-kit)                 # the kit — framework-light, portable, contains NO infrastructure
├── shared-kernel/                           # L0 tactical primitives (domain/cqrs/context/errors/util)
├── tenant-isolation/  authorization/  platform/      # L1 cross-context mechanism + published contracts/ports
└── modules/{subscriptions,workspaces}       # L2 shipped contexts: domain/ (entities + repository PORTS) + application/ (CQRS handlers) — ports only
    modules/organizations/lifecycle/           # NOT a shipped slice — only the shared pure organization/user state-machine kernel (P1 functional-core piece); organizations' own domain/application live in apps/api (below)

apps/api                                     # the reference application — all concretions live here
├── modules/<ctx>/{api,infrastructure}       # HTTP controllers + MikroORM adapters that BIND core ports (ports→adapters)
├── database/  config/  main.ts  app.module.ts   # global infra + DI composition root
├── modules/{organizations,users,posts,payment,storage}  # full local vertical slices (domain→application→infrastructure→api); `organizations` shares its pure lifecycle kernel with `libs/core/modules/organizations/lifecycle`
└── modules/auth                             # system-mechanism context — layer-shape per §Layer-shape: `domain/ports/` (published AUTH_*_STORE ports) + `infrastructure/` (BA adapters) + `api/` (guards/decorators); NO application spine (BA owns auth invariants)

apps/web            # deployable frontend shell (React + Vite) — F0
packages/api-client # exchangeable typed client generated from openapi.yaml (F1)
```

**Boundary invariants (the real red line — held by `fallow` + the per-layer import matrix below):**
1. `libs/core`, at any layer, contains **no** infrastructure / ORM (`@mikro-orm`) / HTTP (controllers, DTOs) concretions — ports live in core, adapters in apps.
2. Dependency direction is always `apps → core`; `libs/core` never imports from `apps/*`.
3. Consumers (apps/api) only perform `ports → adapters` binding + HTTP/wiring.

A "layer shift" is a violation **only** when concretions are pushed into `libs/core` (e.g. a MikroORM entity under `modules/*/domain`); shipping domain + application layers inside the kit is by design, not a violation. Naming is frozen: neither the `@core/saas-kit` package nor the `shared-kernel/` sub-layer will be renamed (large blast radius on inbound imports, zero structural gain — the kit/kernel distinction is now documented, not encoded in folder names). See the ruling: [module-core-position-kernel-vs-kit](../plans/module-core-position-kernel-vs-kit.md).

## The `users` Context (write paths are Command → CommandHandler only)

Controllers never mutate state directly. Illustrating with the real landed flow —
organizations governance (`POST /organizations/:id/approve`) — a CQRS handler spine publishing audit/integration events (not a replay-truth source):

```
POST /organizations/:id/approve
  → Organizations/Platform controller (api)   # builds ApproveOrganizationCommand from validated DTO
  → CommandBus.execute                    # @nestjs/cqrs
  → ApproveOrganizationCommandHandler (application)
        governedOrganizationTransition helper → canTransition pure adjudication (functional core)
        OrganizationStatusService.transition # status row via repo (port → infra adapter)
        EventBus.publishAll([...])        # P3 operation-record events; UoW makes event row
                                          # commit atomically with the business row
                                          # (outbox mode); shadow append → event store
  → returns read-only projection
```

(The former example `POST /users` → `CreateUserCommandHandler` → `User.register(...)` →
`pullDomainEvents()` was a phantom: no such handler/aggregate exists in code — removed by the
2026-10-20 R0 amendment sweep.)

Reads (e.g. `GET /users`, `GET /users/:id`) use `Query` handlers that read the write store
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

### Domain sub-directory law & naming

Within a context's `domain/`, files MUST live in one of the canonical sub-directories — **no business/contract/constant file may sit at the `domain/` root**. Naming is dot-kind (`<name>.<kind>.ts`), matching `.command.ts` / `.query.ts` / `.event.ts`:

| Sub-dir | Holds | File suffix |
|---|---|---|
| `entities/` | immutable domain entities (data carrier + pure transitions) | by name |
| `value-objects/` | VOs (construction-time invariant) | by name |
| `events/` | domain events | `.event.ts` |
| `repositories/` | aggregate persistence ports | `.repository.ts` |
| `ports/` | other outbound ports (gateways/services) | `.port.ts` |
| `policies/` | pure policy/decision functions | `.policy.ts` |
| `constants/` | seed / vocabulary / pure constant tables | by name |

Tests are co-located with their subject (same sub-dir, `<name>.test.ts`). A sub-dir is present only when the context has content for it (see §Layer-shape). This law is purely intra-context: relocating a file inside its own `domain/` never changes the vertical-slice boundary, and `domain/` still must not import `infrastructure/`. This law is machine-enforced by the `verify:domain-layout` identity gate wired into `pnpm run ci` (full + quick) and `pre-push`: any `.ts` sitting at a `domain/` root or in a non-canonical sub-dir fails loud. Scope is `apps/api/*/domain` only — `libs/core` follows a different layout and is excluded.

### Entity Doctrine: domain entity vs data entity

Every persistence-backed bounded context MUST separate two distinct things:

- a **domain entity** under `domain/entities/` — an **immutable data carrier** holding construction-time invariants and **pure transition functions that return new instances** (FC-aligned per P1 — *not* a mutable behavior-box),
  zero framework imports (subject to the `domain/` row above);
- its **physical data entity** under `infrastructure/entities/` — the MikroORM `defineEntity`
  mapping to a table (see the Entity Column Law appendix).

The repository adapter is the single place that maps between the two; **repository ports carry
the domain entity**, while the transport shape stays the application `read-model` — the domain
entity never crosses into `api/` (the `api/` row above). Their mutual consistency
(`domain-state ⊆ data-entity ≡ table`) is governed by the **Projection-Mapping Doctrine** above —
the pure mapper and the compile-time structural lock live in `infrastructure/`, never in `domain/`.
Reference implementation: `posts`.
Other persistence contexts (`organizations`/`users`/`subscriptions`/`workspaces`/`authorization`/`auth`)
are **pending** this doctrine and adopt it via their own audited plans — not instant violations.

### Layer-shape: "a layer exists only if it has content" — the auth / platform case

The four-directory vertical slice (`domain/application/infrastructure/api`) is mandatory **as a shape**, but a given layer is present only when the context actually has content for it. Two recorded, non-violating exceptions (codifying the residual cases the four-layer rule leaves open):

- **`auth`** owns BA-facing write surfaces (session/bootstrap adapters) and the identity ledger, but delegates authentication semantics to Better Auth. It therefore has **no self-owned aggregates/policies and no `application/` spine**; its `domain/` holds **only the published ports** (`domain/ports/` — the `AUTH_*_STORE` contracts), consistent with where every other context places ports (the P4/CQRS bullet: `domain/` carries policies / value objects / **ports**). All its remaining content MUST be placed **by layer**, never left flat at the module root — BA-facing adapters/mounts (`auth.implement`, `auth.bootstrap`, oauth-channels, social-provider-registration, seats-quota-hook, session-resolver) under `infrastructure/`, presentation guards/decorators under `api/`. This is *layer-shape placement*, not a fabricated domain: the moment a genuine auth-local invariant appears, it MUST be materialized as a policy/rule under `domain/` — not merely parked as a port, and not left inline.
- **`platform`** is a governance facade (a cross-context read/command surface) with **no physical table of its own**; its `infrastructure/` holds only foreign-store adapters, and its rules live in the owning contexts (organizations/users) reached via CQRS/events. A facade with no owned persistence has no `domain/` entities to place.

This is the concrete reading of "a layer exists only if it has content" in the P4/CQRS bullet: it licenses omitting an *empty* layer, never omitting the layering discipline itself, and never suppressing a layer that has (or gains) content.

## Bounded Context Map & the Multi-Tenancy Mechanism Layer

### Tenant ≡ Organization · Multi-tenancy is the isolation mechanism (human declaration, 2026-10-23)

Canonical four propositions (re-affirmed by the human, binding — they settle recurring tenant-vs-organization naming questions at the root; each points to its authoritative section, no restatement):

1. **Tenant ≡ organization — now a single vocabulary** (amended by the human, 2026-10-23, superseding proposition ① as first written and the dual-vocabulary clause of global-userfacing-tenant-naming — “这条纪律应该推翻，过时了”): within this framework a tenant **is** an organization, and the business object is called **`organization` everywhere** (context, entities, tables, routes, user copy) — `tenant`/`Tenant` survives **only** as (a) the compound internal name of the isolation **machinery** (`tenant-isolation/`, `TenantIsolationGuard`/`TenantIsolationService`, `@TenantIsolationExempt`) and (b) the industry term **multi-tenancy** (proposition 2); the bare-mechanism `tenancy/`, `TenantScopeGuard`, the CASL adjudication keys `TenantSubject/TenantAction` and the `TENANCY_*` error-code family were all pivoted away by [global-tenant-isolation-vocabulary](../plans/global-tenant-isolation-vocabulary.md) 2026-10-23 (authorization keys now `AuthorizationSubject/AuthorizationAction`; lifecycle/governance codes split into `ORG_/ROLE_/GRANT_/AUTHZ_/ISOLATION_*`). No third “unit” concept may be introduced (see [global-organization-vocabulary-pivot](../plans/global-organization-vocabulary-pivot.md) · glossary).
2. **Multi-tenancy is a data-isolation technique & mechanism**: the `tenant-isolation/` layer is mechanism — request recognition → ALS propagation → isolation guardrails; it does not care what a tenant *is*, only how data is fenced (see §Mechanism Layer vs Business Domain below).
3. **BA tables are shared, not BA-exclusive**: `organization`/`member`/`invitation` and the other BA-convention tables are shared with the business domains — domains read them and may extend them **additively** (see **BA Table Sharing** in the appendix).
4. **BA contract takes precedence on any modification**: when altering these tables, the BA contract is the first consideration — the BA-convention **fields, their data types, and their table relations are all inalienable** (this declaration **extends the recorded red line** from fields + data types to *relations* as well); extension is additive-only (own columns, modeling rationale first).

### Mechanism Layer vs Business Domain: placement criteria (human ruling, 2026-10-21)

The terminology discipline above (Tenant ≠ Multi-tenancy) is a special case of this criterion. The
general test is **not the topic** (whether something is "about" auth or tenant isolation) but **who defines
the rules and whom it serves** — one topic can split in two:

| Placement | Repo locations | Criteria (four axes) |
|---|---|---|
| **System mechanism** | `modules/auth` (identity machinery + `AUTH_*_STORE` ports) · authorization's **ruling machinery** (core guards / CASL projection / predicate-compiler kernel pieces) · the `tenant-isolation/` horizontal layer (ALS propagation / isolation guards / deny-list) · infrastructure **in the narrow sense** (database/config/common/logger/mailer/i18n + provider adapters) | Changes for **technical** reasons (framework upgrades, BA replacement, performance); strictest CA dependency enforcement (core purity guard · port inversion · table-ownership ledger); tested mostly via matrix/wiring identity gates; **tools (BA/CASL/MikroORM) live inside mechanisms** (library constrains the interface, domain owns the facts) |
| **Business domain** | the bounded contexts: `organizations` (lifecycle/governance) · `workspaces` · `posts` · `subscriptions` · `payment` · `storage` · `users` (PIPL compliance) · `platform` (operations facade) · authorization's **management face** (three tables / role CRUD / `domain/policies` — supporting domain) | Changes for **business** reasons; main arena of the functional core + projection doctrine + entity separation; tested via zero-mock kernel tests + compile-time structural locks + gated e2e; **consume mechanism capabilities only through ports** |

**Three cuts where the knife goes wrong most easily**:
1. **One topic, two placements**: the multi-tenancy **mechanism** (`tenant-isolation/` — does not care what a tenant *is*) ≠ the organization **business domain** (`modules/organizations` — defines how organizations live and die); the authentication **mechanism** (`auth` — identity machinery) ≠ the user **compliance domain** (`users` — PIPL export/erase) — the same `user` table seen from two angles, stitched by the `AUTH_USER_STORE` port (global-ba-entity-domain-placement ruling ①).
2. **authorization is dual-natured**: its ruling machinery is mechanism (core kernel pieces, zero imports, purity-guarded); its authorization facts and management face are a supporting domain (own tables, four-layer slice, role-management use cases) — this is the documented reason it is a **bounded context** rather than a horizontal layer (and why its shape differs from `tenant-isolation/`).
3. **Infrastructure in the narrow sense**: `storage`/`payment` are **outbound-gateway contexts with domain policies** (channel fallback, upload validation, money & currency, object-key naming sunk into `domain/` — a backflow example of pillar 2's "DDD by cost/benefit"), **not** infrastructure; the actual facilities are the providers behind them (S3/OSS/COS, Stripe channels) and the database/config layer.

> Operational consequence: when placing a new capability, run it through the four axes above (change-driver / paradigm / testing / tool placement). Mechanism-side changes go through the horizontal & guard review surface (fallow/purity/identity gates); domain-side changes go through the vertical-slice & reviewed-plan surface (entity doctrine / projection / kernel criteria). Misplacing either way (treating a gateway context as a facility, or scattering mechanism policy into contexts as business rules) is structural debt.

Terminology discipline: an **organization** is a business concept (an `organizations` core-domain
**storage entity · NOT a DDD aggregate** — the kernel is the functional trio record `ORGANIZATION_STATUS` + port `OrganizationStatusStore` + function `canTransition`·worded the same as glossary §1—with lifecycle, invariants and language); its physical entity is the
**`status` governance column (real column + DB CHECK) living on the `organization` row** (owned by the `organizations` context·an additive domain column on a BA **shared** table per the *BA Table Sharing* clause below·same-PK 1:1 with the organization·the general rule is the
Entity Doctrine + Projection-Mapping Doctrine above: domain entity ↔ data entity mapped
by the repository adapter). The old self-owned 1:1 side table `tenant` (and the reclamation
amendment 2026-10-20 that first created it) was **superseded and dropped by
[global-governance-lifecycle-consolidation](../plans/global-governance-lifecycle-consolidation.md)
2026-10-23** once its two load-bearing pillars (BA-replaceability → schema isolation, ES
replay-as-truth pilot) were removed—governance lifecycle does not need replay-truth, so the
organization identity collapses onto `organization` with status as its own column; `organization`
is thus both the authentication/membership projection and the organization-lifecycle carrier); **multi-tenancy** is an isolation
mechanism (infrastructure, no aggregate, no lifecycle: request recognition → ALS
propagation → boundary enforcement → exemption axis). The two never co-inhabit:
`tenant-isolation/` hosts no organization-lifecycle business writes, and business contexts never
re-implement isolation. `tenant-isolation/` consumes `authorization` ruling ports; it no longer
houses the CASL checker (slice A) or platform governance (slice D).

**Presentation-layer naming discipline** (superseded as *dual-vocabulary* by global-organization-vocabulary-pivot, human ruling 2026-10-23; originally global-userfacing-tenant-naming): user-facing and business surfaces say **"organization"** (top unit) / **"workspace"** (second-level group) — "tenant" must not leak into user copy **or into business-entity naming anywhere** (code contexts/entities/tables/routes now say organization per the pivot); the `tenant` word now survives **only** inside the compound isolation-machinery name (`tenant-isolation/`, `TenantIsolation*` guards/ALS) and the industry term multi-tenancy — the CASL adjudication keys and the `TENANCY_*` error-code family no longer say tenant (proposition ① carve-out, as tightened by global-tenant-isolation-vocabulary).

Context identities fixed by the domain-refactor plan (global-domain-context-refactor):
`authorization` is an **independent supporting domain** serving both `organizations` (members
carry role keys) and `platform` (operator gate) — never an organizations sub-domain; `platform`
is a **governance facade without aggregates** (organization lifecycle write capability stays
in `organizations`, invoked via the CQRS bus); workspace is a partition inside an organization, an
authorization *subject*, not a role scope. Cross-context references stay weakly coupled:
role keys and foreign ids are plain string columns (no cross-context ORM relations), and
contexts meet only through published ports (e.g. `ROLE_ASSIGNABILITY_READER`).

The three-layer permission chain: `PlatformOperatorGuard` (platform layer) →
`TenantIsolationGuard`/ALS (tenant isolation) → `AuthorizationGuard` + `@Can`
(organization layer + instance-level conditions).

## Cross-Context Communication

Contexts never import each other's internals. Side effects that span contexts are
expressed as domain events subscribed via `@EventsHandler`. `stripe` (payment) and
`storage` are **outbound-gateway contexts and still follow the four-layer vertical
slice** (`domain/` holds the provider port + real policies such as channel selection
& degradation, upload validation, money/currency and object-key naming; `application/`
orchestrates; `infrastructure/` holds the SDK adapters; `api/` the controllers). `auth`
is a **recorded layer-shape exception** (system-mechanism plane: `domain/ports/` +
`infrastructure/` + `api/`, no `application/` spine — see §Layer-shape and deviation
register D1; its layering was completed via global-auth-layering-consistency, so it is no
longer "pending"). Should a context develop
real aggregate needs later, that goes through a trigger-criteria-gated plan (no
more "designated slots").

## Context Boundary: Authentication ↔ Users

`authentication` (constitution name; current directory `modules/auth`) asserts **who you
are**: credentials, sessions, factors, OAuth channels — the Better Auth adapter plane, with
`session-resolver.ts` as the single per-request session resolution surface. `users` owns the
**identity subject**: profile aggregate + PIPL self-service — slow-changing and compliance-sensitive.

Table ownership (SSOT: `apps/api/src/database/table-ownership.ts`): `user` → **users**;
`account`/`session`/`verification` → **authentication**. The seam between the two contexts is
the user↔member relation: `member` (user × organization) is a joining entity of `organizations` —
roles attach to the member, never to the global user, so the same user may hold different
roles in different organizations.

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
2. **Context-owned enums**: domain state-machine enums (`ORGANIZATION_STATUS`, `SUBSCRIPTION_STATUS`,
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
- **Authentication**: Better Auth (**a tool library of the auth domain** — re-adjudicated 2026-10-20 by global-ba-entity-domain-placement, replacing the old "pure auth & membership data source / centralized contract-surface storage view" framing with the CASL-isomorphic principle *the library constrains the interface, the domain owns the facts*): identity-machinery tables (user/session/account/verification/consent) belong to the **auth** domain, org-container tables (organization/member/invitation) to the **organizations** domain — shapes constrained by the BA interface contract (registered in the column law's `BA_CONTRACT_TABLES`; per the **BA Table Sharing** clause below these are *shared, not exclusive*—domains may **additively add their own columns** (modeling rationale first), while the red line is only *do not delete/alter the BA-convention fields, their data types, or their table relations*), operations via the `auth.api.*` tool surface (**owning the tables ≠ taking over the operations**); its built-in org authorization HTTP endpoints are sealed (module-rbac-casl ruling A), member/invitation endpoints served by our own facades via server-side calls; the organization lifecycle status lives in the governance column `organization.status` (real column + DB CHECK·an additive domain column on the BA shared `organization` table·global-governance-lifecycle-consolidation 2026-10-23 supersedes the old self-owned `tenant` side table), and BA `organization.metadata` carries no keys of ours — both promises hold verbatim)
- **Authorization**: CASL (`@casl/ability` v7) — the sole organization-level RBAC ruling engine (its mechanism vocabulary was pivoted off `tenant*` by global-tenant-isolation-vocabulary; see proposition ① carve-out). **The authorization-fact SSOT lives in DB grant rows** (`organization_role`/`organization_role_grant`·per-organization dynamic roles·module-rbac-dynamic-roles ruling C supersedes the old "`tenant-rules` TS table is the SSOT" ruling); **the code vocabulary `authorization-rules` is the language SSOT** (compile-time `AuthorizationSubject/AuthorizationAction` type domain only); **CASL rules are the runtime projection** (the checker lazily projects per-organization via the repository port + in-process version cache·`invalidate` for hot reload). Endpoints declare `@Can(action, subject)` and `AuthorizationGuard` rules from an ALS-preinjected role (no scattered special-casing); instance-level authorization runs at check level (`PermissionCheckInput.resource` + condition rows matched by CASL mongo after resolving the `{{userId}}` template); query-level list filtering is its same-source extension (`PermissionChecker.listPredicate` pushes restricted grant rows down into the list read chain as an instance predicate merged with the isolation (organization) filter under a fixed spread order·module-rbac-query-level-filtering)
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
  substitute (tenant-isolation guards still run). Malformed cursors are a 400, surfaced by the adapter's
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
  bounded context owning the file (`modules/<ctx>/**`; `tenant-isolation/**` counts as `organizations`).
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

## Appendix: Entity Column Law

> Introduced by global-entity-column-law (2026-10-20 · human ruling「GO, 2 取 (a)」). The
> machine-readable registries (immutable tables / BA contract tables / grandfathered
> exemptions) are single-sourced in `apps/api/src/database/entity-column-law.ts`; this
> appendix states the semantics only — never copy the list here. Enforced in CI by
> `entity-column-law.guard.test.ts` (data-level inspection of declarative column metadata;
> stale or new violations fail the gate).

- **L1 Existence**: every table carries `createdAt`; every mutable table also carries
  `updatedAt`. Absence must be a **declared fact**: append-only tables register as
  immutable; Better Auth contract tables are tracked by table-name identity — see the
  **BA Table Sharing** clause below for the additive-column rule.
- **BA Table Sharing (global-governance-lifecycle-consolidation · human ruling 2026-10-23)**:
  Better Auth-related tables are **not exclusive** — they are **shared** tables. Other
  business domains / bounded contexts may **additively add their own domain columns**,
  prioritizing **data-modeling paradigm rationality**. The BA constraint holds: **never
  delete/modify the fields, their data types, or the table relations that BA has agreed to
  use** (the adapter's raw-SQL addressing pins them — mutating = contract violation;
  fields · types · relations are all inalienable per the Tenant ≡ Organization declaration
  above). Self-authored columns added
  onto BA tables fall under L1/L2 (e.g. a new mutable domain column follows `updatedAt nullable`).
- **L2 Convention (human ruling (a))**: a new table's `updatedAt` is `nullable()` —
  NULL means「never modified since creation」; do not fabricate timestamps. Legacy NOT NULL
  update-stamped tables sit on the grandfather registry, **ratchet-style: may shrink, never
  grow**; no schema migration is performed for them.
- **Unification stance**: common columns unify at the *semantics + rules* level, **not** at
  the *structural inheritance* level (BaseEntity / cross-context shared column spreads are
  rejected — structural similarity across bounded contexts is coincidence, and sharing the
  implementation would weld the contexts together). Renegotiation trigger: a real polymorphic
  consumption site (generic audit reader/writer) appearing in the app.
