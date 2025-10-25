# Local Development Services

OnTrack relies on several supporting services during development. The `docker-compose.yml` definition in this directory provisions:

- **PostgreSQL** (port `5432`) for the primary application database.
- **Redis** (port `6379`) for queues, caching, and rate limiting.
- **MinIO** (port `9000`, console `9001`) providing an S3-compatible object store.
- **MailHog** (SMTP `1025`, web UI `8025`) to capture outbound email.

## Usage

```bash
# Start services in the background
pnpm services:up

# Follow service logs
pnpm services:logs

# Stop and remove containers
pnpm services:down
```

The compose file persists PostgreSQL and MinIO data using named volumes (`postgres_data`, `minio_data`). Remove the volumes via `docker compose -f infra/local/docker-compose.yml down -v` if you need a clean slate.

## Access Points

- Postgres: `postgres://postgres:postgres@localhost:5432/ontrack`
- Redis: `redis://localhost:6379`
- MinIO Console: <http://localhost:9001> (credentials `minio` / `minio123`)
- MailHog UI: <http://localhost:8025>

Ensure your `.env` files mirror these defaults (see `.env.example` and `backend/.env.example`). Update secrets as needed for your local environment.
