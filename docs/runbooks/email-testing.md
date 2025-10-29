# Email Delivery Testing (Local)

This guide walks through standing up the local SMTP capture stack (Mailhog) and validating the estimate send flow end-to-end.

## Prerequisites

- Docker Desktop running (or another Docker engine).
- Repository dependencies installed (`pnpm install` from the repo root).
- Backend `.env` populated with SMTP defaults (see below).

### Recommended `.env` values (`backend/.env`)

```env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM="OnTrack <no-reply@ontrack.local>"
# Optional credentials for providers that require auth:
# SMTP_USER="username"
# SMTP_PASS="password"
```

The Nest configuration will default to these values, so you can omit them once they match the Mailhog settings.

## 1. Launch Support Services

From the repository root:

```bash
pnpm services:up
```

This brings up Postgres, Redis, MinIO, and Mailhog using `infra/local/docker-compose.yml`. Tail container logs with `pnpm services:logs`. When finished, shut everything down via `pnpm services:down`.

## 2. Start the App

In separate terminals (or via `pnpm dev`):

```bash
pnpm dev:api
pnpm dev:web
```

The API reads the SMTP config and boots the Nodemailer transporter. No further setup is required if the host/port align with Mailhog.

## 3. Trigger an Estimate Email

1. Navigate to the app at http://localhost:3000.
2. Open a lead and create/send an estimate, or use the Estimates list to send from the detail page. Ensure you provide a valid email address (it will only be used locally).
3. Wait for the success toast (`Estimate sent`) confirming the backend responded 200 OK.

## 4. Verify Delivery in Mailhog

Visit the Mailhog UI: http://localhost:8025.

- All captured messages appear in the inbox.
- Open the latest message to view the rendered HTML and download the generated PDF attachment.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ECONNREFUSED 127.0.0.1:1025` | Mailhog isn’t running. Re-run `pnpm services:up`. |
| `Invalid login` errors | Remove `SMTP_USER`/`SMTP_PASS` for Mailhog or match credentials required by your SMTP provider. |
| Email sends but PDF missing | Check API logs for `Failed to persist estimate PDF…`; ensure MinIO is up (`pnpm services:up`). |
| Nothing in Mailhog inbox | Confirm you’re hitting the local API (not deployed) and that the estimate send form returned a success toast. |

## Switching to a Real Provider

Update `.env` with the host/port/secure/user/pass required by SendGrid, SES, etc. Restart `pnpm dev:api` to rehydrate the transporter. The Estimate detail page now shows the SMTP message ID so you can correlate with provider dashboards or logs.
