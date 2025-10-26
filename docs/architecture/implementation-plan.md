# Implementation Plan & Roadmap

## Phase 0 — Discovery & Planning (Week 1)
- Finalize MVP scope, personas, and acceptance criteria.
- Produce PRD, UX flows, and success metrics (activation, feature adoption, NPS).
- Complete threat model aligned with OWASP ASVS L1; document mitigations.
- Deliver ERD, Prisma schema draft, migration strategy, and seed fixture requirements.
- Establish brand assets (logo, typography, color tokens) for design system.

**Exit Criteria**
- Approved PRD, architecture docs, and security checklist.
- Initial Prisma schema + migration script ready for bootstrap.
- Shared design tokens and component guidelines in Figma/design repo.

## Phase 1 — Foundations (Weeks 2–3)
- Initialize monorepo (pnpm + Turborepo) with Next.js and NestJS scaffolds.
- Configure linting, formatting, testing harnesses (ESLint, Prettier, Jest/Vitest).
- Implement CI/CD (GitHub Actions) covering lint, typecheck, unit tests, build, deploy previews.
- Implement auth base: passwordless email, OAuth, refresh tokens, optional TOTP.
- Build tenancy middleware, RBAC matrix, and activity audit log service.
- Set up S3-compatible storage, presigned uploads, and virus scanning worker.
- Integrate observability stack (OpenTelemetry SDKs, Sentry, structured logging).

**Exit Criteria**
- Developers can run `pnpm dev` for frontend/backends locally with seeded data.
- CI pipelines green on every PR; preview deploys generated automatically.
- Auth + tenancy guard all routes; audit trail recorded for critical actions.

## Phase 2 — Core Domain (Weeks 4–6)
- Implement Contacts & Leads CRUD, pipeline stages, CSV import, public lead form.
  - Admins can upload CSV files (name, email, phone, source, notes, stage) for batch creation with error summaries.
  - Public share link `/public/{tenant}/lead` posts directly into the pipeline with throttled submissions.
- Build Estimate authoring (line items, taxes/discounts, templating, PDF, e-signature).
  - `/estimates/new` route delivers draft authoring with line items, status, notes (Phase 2 baseline).
  - `/estimates/[id]` detail exposes status transitions and job conversion workflow.
  - Send + approval flows capture recipient metadata, generate + attach PDFs, log activity, and unlock job scheduling.
  - Template library delivers `estimate_templates` + `estimate_template_items`, CRUD/apply endpoints, and UI to load, reapply, or clear templates in both the creator and detail flows with activity logging.
- Convert Estimates → Jobs; scheduling scaffolding; job status transitions.
  - Estimate detail now enforces approval-first scheduling, adds resend/record guardrails, and surfaces inline scheduling errors.
  - Lead detail CTAs deep-link into the builder and freshly created estimates redirect to their detail view for conversion.
- Implement Tasks & Checklists with templates and per-job instantiation.
  - Job cards highlight applied templates in the header with inline remove/replace controls.
- Deliver Files & Photos flow (upload, albums, EXIF, resizing).
  - Files service issues presigned uploads, persists metadata, and logs activity when attachments are added or removed.
  - Work board job cards now support inline uploads, previews, and removal for site photos and documents.
  - Estimate detail page exposes attachments so proposals carry supporting documents through approval.

**Exit Criteria**
- Admin can advance a lead to an approved estimate and job creation.
- File uploads scanned, resized, and associated with jobs.
- Comprehensive tests covering lead-to-job flow and file handling.

## Phase 3 — Field Operations (Weeks 7–8)
- Crew mobile views: My Day, job detail, checklist interactions, photo capture.
- Time tracking with GPS, edit requests, approvals.
- Materials & equipment logging with cost codes.
- Offline mode: cache job/task data, queue mutations, conflict resolution UX.

**Exit Criteria**
- Crew can complete daily workflow offline-first (≤60s happy path).
- Time entries synced with GPS data and approval workflow.
- Offline queue handles degraded connectivity without data loss.

## Phase 4 — Billing & Payments (Week 9)
- Invoice generation from jobs/change orders, reminders, balance tracking.
- Stripe integration (card + ACH), webhook handling, partial payments/refunds.
- Client portal enabling estimate approval, invoice payment, job gallery.

**Exit Criteria**
- Client can approve estimate, pay invoice, and receive receipt.
- Finance flows reconcile payments, balance, and activity logs.
- Stripe webhooks resilient and idempotent.

## Phase 5 — Scheduling & Communications (Week 10)
- Calendar UI with drag-and-drop scheduling, availability constraints, ICS export.
- Notification service: email + in-app; SMS reminders via Twilio with opt-in.
- Saved searches, filters, global search (Postgres full-text).

**Exit Criteria**
- Scheduler supports drag-drop updates reflected in jobs.
- Notifications delivered with preference management and audit log entries.
- Search returns tenant-scoped results with saved view persistence.

## Phase 6 — Reporting & Admin (Week 11)
- Reports: pipeline, revenue, job profitability, AR aging, CSV export.
- Admin suite: user & role management, billing plans, tenant settings.

**Exit Criteria**
- Admin dashboards present accurate metrics with materialized views.
- Role management UI enforces RBAC updates and audit logging.
- Billing plan changes trigger usage tracking and Stripe customer updates.

## Phase 7 — Hardening & Launch (Weeks 12–13)
- Performance profiling, N+1 query audits, caching improvements.
- Security review (headers, CSP, rate limiting), pen-test-lite remediation.
- Backup + recovery drill, runbooks, on-call procedures.
- Data migration + seed for demo tenants; release plan and status page.

**Exit Criteria**
- P95 latencies within targets; load tests at 500 concurrent users pass.
- Security checklist complete; outstanding issues triaged.
- Runbooks and disaster recovery validated; launch checklist signed off.

## Cross-Cutting Workstreams
- **Design System**: parallel development in Storybook with accessibility sign-off.
- **Docs & Runbooks**: living documentation for architecture, API contracts, support, and ops.
- **Feature Flags**: progressive delivery toggles for risky releases (Jobs, Billing, Offline).
- **Compliance Prep**: GDPR data export/delete flows, privacy notices, breach plan.

## Developer Environment Setup
1. Install core toolchain: Node 20, PNPM, Docker, Terraform (for infra), AWS CLI.
2. Run `pnpm install` in repo root (once packages are generated).
3. Copy `.env.example` → `.env` for frontend/backend with secrets for Postgres, Redis, Stripe, Twilio, Resend, S3.
4. Start supporting services via `docker compose up` (Postgres, Redis, MinIO/LocalStack).
5. Execute `pnpm db:migrate && pnpm db:seed`.
6. Launch dev servers: `pnpm dev:web`, `pnpm dev:api`, `pnpm dev:worker`.

## Risk Register (Initial)
- **Auth Provider Choice**: Build vs. integrate (Clerk/Auth0) impacts delivery speed and maintenance.
- **Offline Sync Conflicts**: Requires careful UX and data reconciliation to prevent overwrites.
- **Large Media Handling**: Storage/egress costs and virus scanning throughput must be sized correctly.
- **Stripe ACH Onboarding**: ACH verification delays could affect early customers.
- **Multi-Tenancy Bugs**: Small mistakes in tenancy filters pose high risk; enforce automated RLS tests.

## Next Actions
- Finalize decisions on auth provider, job queue stack (BullMQ vs. SQS), and hosting targets.
- Bootstrap monorepo structure and foundational packages.
- Author `.env.example`, docker compose, and first Prisma migration.
- Configure GitHub Actions baseline pipeline.
