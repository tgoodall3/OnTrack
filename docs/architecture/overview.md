# OnTrack Architecture Overview

## 1. Goals & Non-Negotiables
- Deliver a multi-tenant contractor operations platform spanning leads → estimates → jobs → invoices → payments with seamless data continuity.
- Enforce tenant isolation, RBAC, and auditability across every interaction.
- Target production readiness: secure auth, observability, automated testing, CI/CD, and zero-downtime deploys.
- Provide mobile-first, offline-friendly experiences for field crews and a frictionless client portal.

## 2. High-Level System Diagram (Textual)
```
Client Apps (Web PWA + Mobile-friendly UI)
  ├─ Admin / Office / Crew / PM dashboards (Next.js App Router)
  ├─ Client portal (Next.js multi-app routing segment)
  └─ Storybook + Component Library (shadcn/ui + Tailwind)
        │
        ▼
API Gateway (NestJS REST + OpenAPI)
  ├─ Auth & Session Service (passwordless, OAuth, TOTP)
  ├─ Tenant + RBAC Guard
  ├─ Domain Modules (Leads, Estimates, Jobs, Scheduling, Billing, Files, Reporting)
  ├─ Notification Service (email/SMS)
  ├─ Background Jobs (BullMQ on Redis / SQS abstraction)
  └─ Activity Logging + Audit
        │
        ▼
PostgreSQL (Managed) + Prisma
  ├─ Row Level Security (per-tenant policies)
  ├─ Migrations (Prisma Migrate + zero-downtime helpers)
  ├─ Seed Data & Fixtures
  └─ Analytics Views & Materialized Tables
        │
        ▼
Object Storage (S3/R2) ←→ Virus Scan Lambda/Worker
        │
        ▼
Third-Party Integrations
  ├─ Stripe (payments, webhooks)
  ├─ Twilio (SMS)
  ├─ Resend/SendGrid (email)
  ├─ Mapbox (geocoding, maps)
  └─ QuickBooks Online / Google / Microsoft (Phase 2)

Observability Plane
  ├─ OpenTelemetry Collector → Grafana Tempo/Loki/Mimir
  ├─ Sentry error tracking
  └─ Feature flags (GrowthBook/LaunchDarkly equivalent)
```

## 3. Frontend Application (Next.js + TypeScript)
- **Structure**: Monorepo package `apps/web` for core admin/crew UI, plus `apps/portal` routed segment for clients. Shared packages for UI (`packages/ui`), hooks (`packages/features`), and types (`packages/schemas`).
- **State & Data**: React Query for API caching + optimistic updates; Zustand/SWR for local ephemeral state; use `@tanstack/router` features within Next.js for data loaders where needed.
- **Design System**: Tailwind CSS with design tokens matching brand palette (#0F3659, #9FE870, slate neutrals). Extend shadcn/ui with custom primitives hardened for accessibility.
- **Offline/PWA**: Next PWA plugin + Workbox-based service worker. Offline cache of job/task payloads, background sync queue for mutations (time tracking, photo uploads).
- **Internationalization**: `next-intl` scaffolding, ICU message bundles, locale-aware formatting utilities.
- **Testing**: Vitest for unit tests, Playwright for e2e (covering lead-to-payment flow), Storybook with Axe checks.
- **Security UX**: Magic link flows, TOTP setup pages, session timeout warnings, support for reduced motion and high contrast modes.

## 4. Backend Services (NestJS + Prisma)
- **Modules**:
  - `AuthModule`: email magic links, OAuth (Auth0/Clerk/Custom), refresh rotation, TOTP verification, rate limiting, device tracking.
  - `TenancyModule`: middleware reading `X-Tenant-ID` + JWT claims, scoped Prisma client, RLS enforcement guard, tenant-aware caching.
  - `ContactsModule`, `LeadsModule`, `EstimatesModule`, `JobsModule`, `TasksModule`, `TimeModule`, `MaterialsModule`, `InvoicesModule`, `PaymentsModule`, `FilesModule`, `NotificationsModule`, `ReportsModule`.
  - `SchedulingModule`: drag-drop calendar operations, ICS export, staff availability.
  - `ActivityModule`: append-only activity log with structured metadata.
- **Persistence**: Prisma client with per-request context. Enforce soft deletes where necessary for audit, plus event sourcing for critical state transitions (estimate approvals, payments).
- **Background Processing**: BullMQ workers (Redis) for email dispatch, Stripe webhook handling, file processing (resize, EXIF), report aggregation. Abstraction to swap to AWS SQS if needed.
- **API**: REST-first with strict OpenAPI documentation (Nest Swagger). Use Zod or class-validator + class-transformer for request validation. Expose typed SDK generated via `openapi-typescript`.
- **Security**: RLS policies for every tenant-owned table, query guards to append `tenant_id` filters. API key issuance for partner integration (Phase 2). Audit logging for read/write operations with contextual metadata.
- **Observability**: Nest middleware for tracing (OpenTelemetry), structured logging (pino), metrics (Prometheus exporter).
- **File Handling**: Signed URL generation, ClamAV scanning hook (within worker), image resizing pipeline (Sharp).

## 5. Data & Tenancy Strategy
- **Tenant Isolation**: All primary entities carry `tenant_id`. Database-level RLS ensures row access limited to tenant membership plus role checks (crew vs guest). Use PostgreSQL policies with helper views for cross-tenant admin operations (e.g., support).
- **Roles & Permissions**: RBAC tables: `Role`, `Permission`, `RolePermission`, `UserRole`. Define permission matrix for each role (Admin, Office Staff, Crew, Property Manager, Client). Use attribute-based extensions for object ownership (e.g., crew tasks).
- **Migrations**: Prisma Migrate for baseline schema; complement with Drizzle or custom SQL for advanced features (RLS, indexes). Versioned migration scripts with safe down migrations. Use `prisma migrate deploy` in CI/CD.
- **Seed Data**: Deterministic seed script to create demo tenant, sample users, templates, checklists, and sample pipeline data.
- **Reporting Layer**: Materialized views for pipeline metrics, job profitability, AR aging. Refresh via background jobs.

## 6. Integrations
- **Stripe**: Checkout + PaymentIntents for invoices, support for ACH, set up webhooks for payment updates, handle partial payments, sync receipts.
- **Twilio**: SMS notifications for appointment reminders and job status updates. Opt-in/out tracked per contact.
- **Email (Resend/SendGrid)**: Transactional templates (magic links, estimate sent, invoice due, reminders).
- **Mapbox**: Geocoding for properties, map tiles on job sites, route previews.
- **Optional Phase 2**: QuickBooks Online sync (invoices/payments), Google/Microsoft Calendar, additional webhooks.

## 7. Infrastructure & Deployment
- **Repositories**: Monorepo managed with Turborepo; packages for shared code. Separate deployment pipelines for frontend (Vercel) and backend (Fly.io/Render/AWS).
- **Containerization**: Dockerfiles per app. Multi-stage builds (builder + runner). Use PNPM workspace.
- **CI/CD**: GitHub Actions pipeline:
  - Lint + typecheck
  - Unit tests + coverage
  - Playwright e2e (nightly/full)
  - Accessibility checks (axe/pa11y)
  - Build artifacts
  - Deploy to preview branches (Vercel, Fly.io)
- **Secrets Management**: GitHub Actions OIDC + cloud providers. Use Doppler/AWS Secrets Manager for runtime secrets.
- **Infrastructure as Code**: Terraform in `infra/` provisioning Postgres (Neon/Supabase) with read replicas, S3 bucket, Redis (Upstash/ElastiCache), monitoring stack, Cloudflare CDN.
- **Resilience**: Blue/green deploy strategy with health checks. Postgres PITR backups automated. Redis with high availability. Static assets behind CDN.

## 8. Observability, Security & Compliance
- **Telemetry**: OpenTelemetry instrumentation across services, traces exported to managed collector. Metrics for API latency (P95 target <300ms), job queue depth, worker failures.
- **Logging**: JSON logs with correlation IDs, tenant context, and user IDs. Ship to Logtail/Loki.
- **Security Controls**:
  - HTTPS enforcement, HSTS, TLS 1.2+.
  - JWT + rotated refresh tokens stored in HttpOnly, SameSite=strict cookies.
  - Email verification + magic link expiry. Device binding via signed tokens.
  - Rate limiting (per IP and per tenant) using Redis sliding window.
  - CSRF protection for cookie-auth endpoints, single-use tokens for uploads.
  - CSP, XSS protection headers, input validation.
  - File scanning (ClamAV), MIME verification, size limits, secure storage policies.
  - Audit trails for critical events; tamper evidence via hash chains (optional).

## 9. Performance & Offline Strategy
- **Frontend**: Route-based code splitting, lazy loading heavy modules, limit JS bundle budgets (200KB gz). Use Suspense + streaming for faster TTFB. Preload critical data via HTTP caching.
- **Backend**: Index all FK columns + frequent filters, use read replicas for reporting, background pre-computation of aggregates. Employ Redis cache for expensive queries with tenant scoping. Async processing for non-blocking operations (email, PDFs).
- **Offline**: Service worker caches job metadata; background sync queue for clock entries, task updates, photo uploads. Provide UI state indicators for pending sync and conflict resolution.

## 10. Testing & QA Strategy
- **Unit Tests**: ≥70% coverage on critical path services (auth, tenancy, billing). Use Jest on backend, Vitest on frontend.
- **Integration Tests**: Prisma test harness with ephemeral Postgres (Testcontainers). API contract tests generated from OpenAPI using Dredd or Schemathesis.
- **E2E**: Playwright scenarios for lead intake, estimate approval, job completion, invoice payment, client portal flows.
- **Accessibility**: jest-axe on Storybook, Pa11y CLI on key routes, Lighthouse CI enforcing ≥95 a11y.
- **Load Testing**: k6 scripts simulating 500 concurrent users, verifying latency budgets.
- **Security Testing**: ZAP/Burp suites for auth flows, custom RLS probing tests.

## 11. Roadmap Snapshot
- Phase 1: Repo setup, CI/CD, foundational auth + tenancy + audit.
- Phase 2: Core domain models (Leads → Jobs) with file handling.
- Phase 3: Field operations (mobile UX, offline, time tracking).
- Phase 4: Billing & payments (Stripe integration, invoicing, portal).
- Phase 5: Scheduling & notifications (calendar, SMS).
- Phase 6: Reporting & admin controls.
- Phase 7: Hardening, DR drills, launch readiness.

## 12. Open Questions & Risks
- Final decision on auth provider (self-built vs Clerk/Auth0) impacts timeline.
- Ensure offline sync conflicts resolved cleanly (last-write wins vs merge strategy).
- Virus scanning cost/latency for large uploads—may require asynchronous acceptance.
- Stripe ACH micro-deposit verification timeline (impacting go-live for ACH).
- QuickBooks Online, calendar sync, and advanced analytics remain post-MVP scope.

