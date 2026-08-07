# Development Guidelines

This guide captures everything Claude needs to work effectively in this codebase without requiring repeated context from the developer.

---

## Project Context

**<add your project description here. Better project description will allow better DDD based design>

---

## Development Methodology

- **DDD (Domain-Driven Design):** Think in domain terms — entities, aggregates, bounded contexts. When suggesting new modules, start from the domain concept, not the CRUD operation.
- **TDD (Test-Driven Design):** Write or suggest tests before implementation. Services must have unit tests. Critical flows must have integration tests.
- **BDD (Behavior-Driven Development):** Frame acceptance criteria in Given/When/Then terms where possible.

**Why:** Goal is to reduce QA dependency and reach code maturity faster by building quality and domain correctness in from the start.

---

## Session Start Protocol

**At the start of every session, before doing any work, ask the developer:**

> "Have there been any manual code changes made directly (outside of an agent session) since our last session?"

### If the developer says YES:

1. **Require a commit hash** — the hash of the first commit that contains the manual changes. All commits from that hash to `HEAD` are in scope.
   - Run `git log --oneline -10` and show the output to help the developer identify the correct hash.
   - **Hard boundary: if no commit hash is provided, do not proceed.** Ask the developer to commit any uncommitted changes first, then provide the hash.
2. **Inspect the diff** — run `git diff <hash>^..HEAD` to see exactly what changed. Do not rely solely on the developer's description.
3. **Classify each change:**
   - **Implementation detail** (null guard, rename, refactor, comment) → note it, no doc update needed.
   - **Behavioral change** (new condition, new rule, new edge case, new API contract) → update the relevant BC skill file (`SKILL.md`, `bdd-scenarios.md`, `domain-model.md`, etc.) before proceeding with any new work.
4. **Confirm sync is complete** before moving on.

### If the developer says NO:

1. **Check for uncommitted changes** — run `git status` to verify the working tree is clean.
   - **Hard boundary: if uncommitted changes are detected, do not proceed.** Ask the developer to commit them first, then re-answer the opening question.
2. **Check for unpushed local commits** — run `git log origin/<current-branch>..HEAD --oneline` to see if any committed-but-not-yet-pushed commits exist.
   - If unpushed commits are found, show them to the developer and ask whether they contain manual changes that need to be classified before proceeding.
   - If the developer confirms they are agent-session commits (not manual), accept and proceed.
3. If the working tree is clean and there are no unreviewed unpushed commits, accept the confirmation and proceed.
   
### Why this protocol exists

Minor manual changes are a legitimate part of the workflow — not every fix needs a full BDD cycle. But the agent's context (skill files, BDD scenarios) must always reflect the actual code. This protocol ensures the two never silently diverge.

### Decision records

Keep decisions with the context that owns them so parallel work on different BCs
does not create conflicts in one global file:

- **BC-specific decisions** -> `.github/skills/<bc-name>/decisions.md`
- **Workflow-skill decisions** -> `decisions.md` beside that skill's `SKILL.md`
- **Cross-cutting architecture decisions** -> one standalone ADR per decision in
  `docs/adr/YYYY-MM-DD-<decision-slug>.md`

Do not maintain a global append-only decisions file. Format local entries as
**Asked -> Findings -> Decision/Action**. Record only concluded decisions, not
in-progress deliberation. If a decision affects several BCs, create an ADR and
link to it from each affected BC's `decisions.md` rather than copying the full
decision into multiple files.

---

## Tech Stack

- **Framework:** NestJS 11 (TypeScript)
- **ORM:** Sequelize + sequelize-typescript (PostgreSQL)
- **Multi-tenancy:** Schema-per-tenant (see Architecture section)
- **Migrations:** Umzug (run programmatically, not via CLI)
- **Validation:** class-validator + class-transformer
- **API Docs:** Swagger (@nestjs/swagger)
- **Testing:** Jest + ts-jest
- **Linting:** ESLint flat config + Prettier
- **Commits:** Conventional Commits enforced via Husky + Commitlint

---

## Architecture: Schema-Per-Tenant Multi-Tenancy

This is the most important architectural concept in this project. Read this carefully before touching any database or provisioning code.

### How it works

The system uses **separate schema per tenant** isolation. One PostgreSQL database, but each tenant gets their own schema:

```
PostgreSQL Database: hGate_portal
│
├── public schema              ← shared/global data
├── tenant_abc123_uuid         ← Tenant A: their own complete set of tables
├── tenant_def456_uuid         ← Tenant B: isolated, no overlap with A
└── ...
```

Schema name format: `tenant_<tenantId with hyphens replaced by underscores>`

### Per-request tenant routing

Every HTTP request carries a tenant context. The mechanism:

1. `src/shared/cls-namespace.ts` initialises a CLS (continuation-local storage) namespace — **must be imported before Sequelize is configured**
2. Auth middleware resolves the tenant from the request and calls `TenantContextService.setTenantSchema(tenantId)`
3. Sequelize has a `beforeQuery` hook in `sequelize.config.ts` that reads the namespace and sets `search_path` on every query
4. All Sequelize model queries automatically hit the correct tenant schema — no `tenant_id` column needed anywhere

### Provisioning flow

When a new tenant is onboarded, `POST /v1/setup/provision` is called (API key protected):

1. `TenantSchemaService.createTenantSchema(tenantId)` — runs `CREATE SCHEMA tenant_xyz` then executes all Umzug migrations inside it
2. Seed default configs into the new schema
3. Tenant is now live

This endpoint can also be triggered automatically via a Google Pub/Sub message from FooBar's core platform (`service: "schema"` payload).

### Key implication

There is no `tenants` table. A tenant's existence = their schema existing in the database. Background jobs enumerate tenants by querying `information_schema.schemata WHERE schema_name LIKE 'tenant_%'`.

---

## Bounded Context Skills

Each bounded context or cross-cutting concern has a skill file with its full design, flows, and invariants. **Always read the relevant skill before touching code in that area.**

| Area | Skill file |
|---|---|
| Auth (middleware, Firebase, Identity Service, cookies) | `.github/skills/auth/SKILL.md` |
| Catalog (product browsing proxy, eCommerce Core ACL, channel token management) | `.github/skills/catalog/SKILL.md` |
| Activations (activation requests, LiveOps approval/rejection/revocation, product activations) | `.github/skills/activations/SKILL.md` |
| Cart (active/draft cart, cart items, recipients, submission orchestration) | `.github/skills/cart/SKILL.md` |
| Orders (OMS integration — create/list/get orders, OMS auth token lifecycle) | `.github/skills/orders/SKILL.md` |

The auth skill folder also contains companion files:
- `.github/skills/auth/domain-model.md` — TypeScript interface definitions for all value objects
- `.github/skills/auth/bdd-scenarios.md` — Gherkin acceptance scenarios
- `.github/skills/auth/firebase-acl.md` — Firebase Admin SDK adapter contract and env vars
- `.github/skills/auth/identity-service-acl.md` — Identity Service HTTP contract and Redis caching

The catalog skill folder also contains companion files:
- `.github/skills/catalog/domain-model.md` — EcommerceCatalogPort interface and product shape
- `.github/skills/catalog/bdd-scenarios.md` — Gherkin acceptance scenarios for browsing and channel resolution
- `.github/skills/catalog/ecommerce-catalog-acl.md` — eCommerce Core proxy details, per-tenant channel flow

> **Sync rule:** When any code under `src/auth/**`, `src/catalog/**`, `src/activations/**`, `src/cart/**`, `src/orders/**` changes, update the relevant skill files in the same task before marking work complete.

---

## External Service Integrations

The hGATE portal integrates with several external FooBar services. All base URLs and credentials are environment-variable driven — never hardcode them.

### FooBar Catalog API
The hGATE portal does **not** own product data. All catalog content is sourced from an external FooBar Catalog API (eCommerce Core).

- **Auth:** Two-step — admin API key fetches a per-channel JWT; JWT is cached in Redis (23h TTL) and used as Bearer token for all product calls
- **Product types:** Gift Cards, Offers, Merchandise
- **Per-tenant sales channels:** Each tenant gets their own sales channel created at provisioning time (`EcommerceSalesChannelService`). Channel code is stored in `public.tenants.sales_channel_code`. During development, all product calls use the default channel (`ECOMMERCE_DEFAULT_CHANNEL_CODE`) when `ECOMMERCE_CORE_USE_DEFAULT_CHANNEL=true`. Set to `false` or omit to use per-tenant channels.
- **`catalog_product_id`** in the schema = `id` for gift cards/offers, `sku` for merchandise — always a `varchar`, never a local UUID
- **Denomination types:** Gift cards are either `FIXED` (tenant picks from an allocated list of values) or `OPEN` (tenant specifies an amount) — this distinction drives cart item validation logic

### Catalog Activation Workflow
Tenants cannot order directly from the catalog. The flow is:
1. Tenant submits a `catalog_activation_request` selecting products they want available
2. LiveOps approves or rejects each item individually via `PATCH /v1/liveops/activation-request-items/:id/approve|reject`
3. Only `APPROVED` items become `product_activations` — these are the orderable records

### OMS (Order Management System)
Orders are owned entirely by an external OMS. The portal stores only `external_order_id` on the `carts` table once a cart is submitted. Order status is always fetched on demand — never mirrored or cached locally.

### Wallet Service
Wallet balances are live from an external Wallet Service — never stored locally. The `wallet_policies` table stores only the tenant's policy rules (caps, thresholds) that the portal enforces.

### Identity Service
User identity is owned by the Identity Service. All `*_user_id` fields throughout the schema are Identity Service UUIDs. There is no local `users` table.

---

## Project Status

**What is set up:**
- Core NestJS scaffold (main.ts, AppModule, health endpoint)
- Sequelize + CLS-based multi-tenancy infrastructure
- TenantContextService, TenantSchemaService, EcommerceSalesChannelService
- ProvisionModule (`POST /v1/setup/provision`) — creates tenant schema + per-tenant eCommerce sales channel
- AuthModule — full hexagonal auth implementation:
  - `AuthMiddleware` (Firebase session/token + encrypted platform cookie → `req.user`)
  - `ApiKeyMiddleware` (x-api-key header for system-to-system routes)
  - `FirebaseTokenVerifierAdapter` + stub for tests
  - `IdentityServiceHttpAdapter` (Redis-cached 15 min) + stub for tests
  - `RolesGuard`, `@CurrentUser()`, `@TenantId()`, `@Roles()` decorators
  - `CookieCryptoUtil` (AES-256-GCM)
- CatalogModule — product browsing + category proxy:
  - Product catalog browsing (proxy to eCommerce Core, per-tenant channel resolution)
  - Category listing (`GET /v1/catalog/categories` → `GET /v1/channel/categories`)
- ActivationsModule — activation request lifecycle, LiveOps approval/rejection/revocation, product activations (see `.github/skills/activations/SKILL.md`)
- CartModule — active/draft cart provisioning, cart items and recipients, submission orchestration via the Orders BC port (see `.github/skills/cart/SKILL.md`)
- OrdersModule — OMS integration: create/list/get orders, OMS auth token lifecycle (see `.github/skills/orders/SKILL.md`)
- SharedModule with global `RedisProvider`
- Swagger (Basic-Auth protected), Helmet, CORS, ValidationPipe
- ESLint, Prettier, Jest, Husky + Commitlint

**What is NOT yet built:**
- TenantConfigModule (config keys not yet defined)
- Pub/Sub interservice event handler

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| File names | kebab-case | `tenant-schema.service.ts` |
| Classes, Interfaces | PascalCase | `TenantSchemaService` |
| Functions, methods | camelCase | `createTenantSchema()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Enum names | PascalCase | `ProvisionStatus` |
| Enum values | UPPER_SNAKE_CASE | `PROVISION_STATUS.PENDING` |

---

## Code Style

- **No `any` type** — use proper types everywhere
- **Interfaces over type aliases** for object shapes
- **Explicit return types** on all public methods
- **Controller-Service-Repository pattern** — controllers handle HTTP only, services hold business logic, repositories handle data access
- **NestJS DI only** — never manually instantiate classes
- **NestJS exception classes** — `NotFoundException`, `BadRequestException`, etc.
- **DTOs with class-validator** on all request payloads
- **Pagination** on all list endpoints

---

## Unit Testing Standards

- **Pattern:** Arrange-Act-Assert
- **Naming:** `'<Method> should <expected behaviour> when <state>'`
- **No log-based assertions** — test actual outcomes
- **No unnecessary mocks** — only mock what's required
- **Isolated** — tests must not depend on each other
- **Coverage target:** ≥80% statements and lines on every new BC — enforced by SonarCloud quality gate

### What to test in a new BC

Every new bounded context must have spec files covering all of these layers before the PR is merged:

| Layer | What to cover |
|---|---|
| `application/services` | All public methods — happy path + every exception branch |
| `application/jobs` | Each `@Cron` method — verifies it calls the repository and completes without error |
| `infrastructure/repositories` | All public methods — mock the Sequelize model, assert correct calls and return values |
| `infrastructure/acl` (adapters) | All public methods — mock the downstream port, assert delegation and filtering |
| `presentation/tenant` controllers | All handler methods — mock the service, assert DTO mapping and pagination fields |
| `presentation/liveops` controllers | All handler methods — mock the services, assert `null` user-id forwarding and schema resolution |
| `domain/utils` | Pure functions — cover all branches (all known formats + unknown → null) |

**What you do NOT need to test:**
- TypeScript interfaces (`domain/ports/**`) — no executable code
- Sequelize model class definitions (`infrastructure/models/**`) — no business logic
- Enum files — no executable code

```typescript
it('createTenantSchema should throw when tenantId is empty', async () => {
  // Arrange
  const tenantId = '';

  // Act & Assert
  await expect(service.createTenantSchema(tenantId)).rejects.toThrow();
});
```

---

## Branch & Release Strategy

Full process: `docs/release-process.md`

**Branch structure:** `main` (prod) ← `staging` (stable) ← `development` (integration)

**Key rules:**
- Always branch from `staging`, never from `development`
- PRs from feature branches target `development`
- Merges are always standard merges — never squash, never cherry-pick
- Branch naming: `feat/RP-123-description`, `fix/RP-123-description`, `hotfix/RP-123-description`
- When creating a PR to `development`, also open one to the current `release/vX.X.X` branch simultaneously

---

## Pull Request Standards

Always use the PR template at `.bitbucket/pull-request-template.md` when creating a PR. Fill in every section — do not leave placeholders.

- **Title format:** `type(scope): description [RP-XX]` — always include the Jira ticket number
- **Destination branch:** `main`
- **Source branch:** feature or fix branch off `dev`

---

## Commit Standards

Conventional Commits format, enforced by Commitlint:

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`

Examples:
```
feat(provision): add default config seeding on tenant creation
fix(tenant-schema): handle duplicate schema creation gracefully
test(provision): add unit tests for ProvisionService
```

---

## Environment Variables

### Where env vars live

`.env.example` is the canonical reference for variable names and descriptions. **The actual values for deployed environments live in `env/`:**

```
env/
├── common/variables.env    ← vars identical across all environments (cache TTLs, pool sizes, etc.)
├── common/secrets.env      ← secrets shared by all environments
├── develop/variables.env   ← develop-specific (DB_HOST, NODE_ENV, BASE_DOMAIN, …)
├── develop/secrets.env
├── staging/                ← same structure
└── production/             ← same structure
```

**Rule:** When you rename or add an env variable, update **all three**: `.env.example`, the relevant `env/common/` or `env/{environment}/` file(s), and any code that reads `process.env.*`.

Secrets files use GCP Secret Manager references (`SECRET_NAME:latest`), not literal values. Variables that are the same across every environment belong in `env/common/`; environment-specific values go in the per-environment folders.

### Key variables

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | PostgreSQL connection |
| `DB_POOL_SIZE`, `DB_ACQUIRE`, `DB_IDLE_TIME`, `DB_IDLE_IN_TRANSACTION` | Connection pool tuning |
| `APP_PORT` | Server port (default 3000) |
| `hGATE_SERVICE_ADMIN_API_KEY` | Protects system-to-system routes (provision endpoint) |
| `NODE_ENV` | `local` / `development` / `staging` / `production` |
| `FooBar_COOKIE_SECRET` | AES-256-GCM key for `FooBar_hGATE-portal` cookie — must be exactly 32 UTF-8 bytes |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Redis connection (used for Identity Service token cache) |
| `FooBar_hGATE_PROJECT_SERVICE_ACCOUNT_JSON` | JSON blob for Firebase Admin SDK initialisation |
| `IDENTITY_SERVICE_API_BASE_URL` | Base URL for FooBar Identity Service |
| `IDENTITY_SERVICE_ADMIN_API_KEY` | API key for FooBar Identity Service |
| `SWAGGER_USER`, `SWAGGER_PASS` | Basic-Auth credentials for Swagger UI |
| `BASE_DOMAIN` | Base domain for CORS origin validation (e.g. `FooBarengage.com`) |

---

## Key File Locations

| What | Where |
|---|---|
| CLS namespace init | `src/shared/cls-namespace.ts` |
| Sequelize config + beforeQuery hook | `src/database/sequelize.config.ts` |
| Tenant schema creation + Umzug | `src/tenant-schema/tenant-schema.service.ts` |
| Per-request tenant context | `src/shared/infrastructure/tenant/tenant-context.service.ts` |
| eCommerce sales channel creation (provisioning) | `src/shared/infrastructure/ecommerce/ecommerce-sales-channel.service.ts` |
| eCommerce catalog proxy (product browsing) | `src/catalog/infrastructure/acl/ecommerce-catalog.client.ts` |
| Provision endpoint | `src/shared/provision/provision.controller.ts` |
| Admin auth middleware | `src/auth/middleware/admin-auth.middleware.ts` |
| API key middleware | `src/auth/middleware/api-key.middleware.ts` |
| Firebase token verifier port | `src/auth/domain/ports/firebase-token-verifier.port.ts` |
| Identity service port | `src/auth/domain/ports/identity-service.port.ts` |
| AuthenticatedAdmin value object | `src/auth/domain/value-objects/authenticated-admin.interface.ts` |
| Firebase adapter (production) | `src/auth/infrastructure/firebase/firebase-token-verifier.adapter.ts` |
| Identity service adapter (production) | `src/auth/infrastructure/identity-service/identity-service-http.adapter.ts` |
| Cookie crypto util (AES-256-GCM) | `src/auth/shared/cookie-crypto.util.ts` |
| Roles guard | `src/auth/guards/roles.guard.ts` |
| Redis provider | `src/shared/infrastructure/redis/redis.provider.ts` |
| Migrations (tenant-scoped) | `src/database/migrations/` |
| Migrations (public schema) | `src/database/public-migrations/` |
| Swagger setup | `src/shared/swagger/setup-swagger.ts` |
| CORS config | `src/shared/cors/cors.config.ts` |
