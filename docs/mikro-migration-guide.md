# MikroORM Migration and Seeding Setup

This document provides comprehensive guidance for using MikroORM migrations and seeding in this NestJS project with PostgreSQL.

## Quick Start

### First Time Setup
```bash
# Setup everything: apply migrations and seed data (development)
pnpm run db:setup
```

### Development Workflow
```bash
# 1. Make changes to the entity model under apps/api/src/database/mikro/**
#    (runtime entities + migration entities derive from the single column-metadata source column-meta.ts)
# 2. Generate a migration from the diff between entity metadata and the current DB schema
pnpm run migration:generate

# 3. Review the generated SQL/TS artifact, then apply pending migrations to the database
pnpm run migration:run

# 4. Seed database with sample data
pnpm run db:seed
```

## Available Commands

### Migration Commands
| Command | Description | Environment |
|---------|-------------|-------------|
| `pnpm run migration:generate` | Generate a migration from the entity ↔ schema diff (`migrator.create()`) | Development |
| `pnpm run migration:run` | Apply pending migrations (`migrator.up()`) | Dev / Production |

> The runners are `tsx` scripts (`scripts/mikro-migration-create.ts`, `scripts/mikro-migrate.ts`) driven by
> the migration-only assembly `apps/api/src/database/mikro/migration/mikro-migration.config.ts`. There is no
> separate `mikro-orm` CLI binary in this project — the scripts are the single entry point.

### Database Management
| Command | Description |
|---------|-------------|
| `pnpm run db:seed` | Run database seeding |
| `pnpm run db:reset` | **Destructive** dev recreate: `mikro-migrate.ts --fresh` (drops entity tables + migration ledger, replays baseline) + reseed |
| `pnpm run db:setup` | Full setup (`migration:run` + seed) |

⚠️ `db:reset` runs `schema.drop()` — **never point it at a shared or production database**. Production only
uses the incremental `migration:run`.

## 🌱 Seeding Options

### Basic Usage
```bash
# Standard seeding
pnpm run db:seed

# Only essential data (no test posts)
pnpm run db:seed -- --no-test-data

# Custom number of users and posts
pnpm run db:seed -- --users 5 --posts 10
```

### Environment Variables
`seed.ts` calls `dotenv.config()` first, so all three keys below can live in your `.env`
instead of being prefixed on every command line (`.env.example` documents them, commented out).

```bash
# Custom admin password
ADMIN_PASSWORD=your_secure_password pnpm run db:seed

# Custom user password
USER_PASSWORD=user_secure_password pnpm run db:seed

# Clean database before seeding
SEED_CLEANUP=true pnpm run db:seed
```

⚠️ **Two silent behaviours worth knowing before you seed anything shared:**

- If `ADMIN_PASSWORD` / `USER_PASSWORD` are unset, the seed **falls back to hardcoded
  credentials** (`admin123` for the platform operator account resolved from
  `PLATFORM_OPERATOR_EMAIL`, `user123` for the `user{i}@example.com` demo users). No warning is
  printed. Set them explicitly on any database reachable by others.
- `SEED_CLEANUP=true` is **destructive**: it deletes every row of the `post` and `user` tables
  before re-seeding. Never enable it against a shared or production database.

## PostgreSQL Specific Notes

PostgreSQL is a strongly-typed relational database, so schema changes must be tracked with versioned migrations:

- **`migration:generate`** produces a reviewable migration artifact (TS + snapshot) under
  `apps/api/src/database/mikro/migration/migrations/`.
- **`migration:run`** applies those artifacts (`migrator.up()`); use it in production.
- There is **no implicit schema sync/push** — the `--fresh` recreate path is a dev-only convenience and is
  never a production migration mechanism.

## 📁 Project Structure

```
apps/api/src/database/
├── database.module.ts             # Global module wiring MikroORM + event store
├── seed.ts                        # Seeding script (Mikro insert path)
└── mikro/
    ├── mikro-orm.factory.ts                     # MikroORM v7 init (PostgreSqlDriver)
    ├── entities.ts                # Better Auth surface entities
    ├── four-tables.ts             # workspace/user_status/tenant_subscription/event entities
    ├── column-meta.ts             # Single source of column metadata (runtime + migration derive)
    ├── post.entity.ts             # Post entity
    ├── mikro-orm.service.ts       # NestJS provider (lazy init, per-request em.fork())
    ├── mikro-orm.module.ts        # @Global MikroOrmModule
    └── migration/
        ├── mikro-migration.config.ts   # Migration-only assembly (Migrator extension)
        ├── migration-entities.ts       # Faithful migration entity set
        └── migrations/                 # Generated migrations + snapshot (table mikro_migrations)
scripts/
├── mikro-migration-create.ts      # migration:generate runner (tsx)
└── mikro-migrate.ts               # migration:run / db:reset runner (tsx)
```

## Production Deployment

```bash
# Generate a migration from the entity changes (review & commit the artifact to VCS)
pnpm run migration:generate

# Apply migrations against the production database
NODE_ENV=production pnpm run migration:run

# Seed essential data only
pnpm run db:seed -- --no-test-data
```
