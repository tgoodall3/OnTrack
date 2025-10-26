# OnTrack API

NestJS service providing the REST API, tenancy enforcement, and background job orchestration for OnTrack.

## Getting Started

```bash
# Install dependencies from repository root (after pnpm is installed)
pnpm install

# Generate Prisma client
pnpm --filter @ontrack/api prisma:generate

# Run migrations against your local database
pnpm --filter @ontrack/api prisma:migrate

# Seed demo data (runs manual SQL via docker exec)
pnpm --filter @ontrack/api db:seed

# Optional: run Prisma-based seed (may require native Postgres access on Windows)
pnpm --filter @ontrack/api db:seed:prisma

# Start the API with live reload
# Option A: scoped Turbo target
pnpm dev:api

# Option B: direct package script
pnpm --filter @ontrack/api start:dev
```

The service reads configuration from environment variables. Use `.env.example` as a template and supply database credentials along with integration keys (Stripe, Twilio, Resend, S3).

### Local email delivery

Estimate sending now uses SMTP. For local development we default to Mailhog (`smtp://127.0.0.1:1025`). Run the Mailhog service from `docker-compose.yml`, then set the following vars (already present in `.env.example`):

```
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM="OnTrack <no-reply@ontrack.local>"
```

Optional `SMTP_USER`/`SMTP_PASS` can be provided when connecting to a real provider. Preview captured messages at http://localhost:8025.

## Project Layout

- `src/` - NestJS modules, controllers, services, and shared providers
- `prisma/schema.prisma` - relational schema for tenants, roles, leads, jobs, invoices, and related entities
- `prisma/manual_seed.sql` - SQL helper for environments where Prisma cannot reach Dockerized Postgres (invoked by `db:seed`)
- `prisma/seed.ts` - TypeScript bootstrap script for demo tenant, roles, and a sample user (run via `db:seed:prisma`)
- `test/` - Jest-based unit and e2e test harness

## Next Steps

- Add feature modules (auth, tenants, leads, jobs, billing) under `src/`
- Implement REST controllers and DTOs backed by Prisma models
- Configure background workers (BullMQ/SQS) for notifications, file processing, and reporting
- Extend automated tests to cover tenancy and RBAC policies
