# OnTrack - Contractor Operations Platform

OnTrack is a multi-tenant SaaS that guides contractors from lead intake through estimates, job execution, invoicing, and payments. The platform serves Admins, Office Staff, Crew Members, Property Managers, and Clients with mobile-first workflows, offline support, and production-grade security and observability.

## Project Structure
- `frontend/` - Next.js App Router workspace for the operational UI and client portal.
- `backend/` - NestJS + Prisma service exposing REST APIs, tenancy middleware, and background workers.
- `docs/` - Architecture notes, implementation roadmap, and operational runbooks.
- `infra/` - Terraform/Pulumi (pending) for cloud infrastructure definitions.
- `packages/` - Future shared libraries (design system, schemas, utilities).

## Core Tenets
- Multi-tenant architecture with strict RBAC and Postgres row-level security.
- Passwordless magic links, OAuth, and optional TOTP 2FA.
- Stripe-powered invoicing and payments, S3-compatible file storage with virus scanning.
- Observability via OpenTelemetry + Sentry, with CI/CD automation and layered testing.
- Mobile-first UX with offline capabilities for crews and a secure client portal.

## Getting Started (work in progress)
1. Enable pnpm (recommended via `corepack prepare pnpm@9.11.0 --activate`) or install it manually.
2. From the repository root run `pnpm install` to hydrate all workspace dependencies.
3. Copy `.env.example`, `frontend/.env.example`, and `backend/.env.example` to their `.env` counterparts and fill in secrets.
4. Generate the Prisma client and database schema:
   - `pnpm --filter @ontrack/api prisma:generate`
   - `pnpm --filter @ontrack/api prisma:migrate`
   - `pnpm --filter @ontrack/api db:seed`
5. Start services locally with `pnpm dev` to run we + API together, or `pnpm dev:web` / `pnpm dev:api` to run individually.

### Local Support Services
- Launch database/cache/object storage/email capture with `pnpm services:up` (uses `infra/local/docker-compose.yml`).
- Tail service output via `pnpm services:logs`; shut everything down with `pnpm services:down`.
- Default connection details are mirrored in `.env.example` files (Postgres on `localhost:5432`, Redis `6379`, MinIO `9000/9001`, MailHog `1025/8025`).

## Documentation Index
- Architecture overview: `docs/architecture/overview.md`
- Implementation roadmap: `docs/architecture/implementation-plan.md`
- Runbooks (placeholder): `docs/runbooks/`

## Current Status
- Architectural plans and roadmap are documented.
- Monorepo scaffolding is in place with Next.js frontend and NestJS backend skeletons.
- Dashboard pulls live tenant-scoped metrics with Leads, Estimates, and Jobs modules now exposing CRUD APIs and starter UIs.
- Prisma schema defines tenant, role, and operational domain entities with a seed script for demo data.
- Next steps: wire auth/RBAC, stand up observability + CI tooling, and deepen task/crew workflows per roadmap.
