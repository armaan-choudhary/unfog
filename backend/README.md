# Backend application and persistence

The backend contains a FastAPI application factory and the initial SQLAlchemy
models and Alembic migration for users, repositories, immutable snapshots, and
indexing jobs. Repository import, authentication, business endpoints, and
workers remain later-ticket work. Do not install or execute code from imported
repositories.

Create and activate a repository-local virtual environment, then install the
dependencies from this directory:

```bash
python -m venv ../.venv
source ../.venv/bin/activate
python -m pip install -r requirements-dev.txt
```

Set `DATABASE_URL` to a PostgreSQL connection URL before running migrations.
For example, use the local-only placeholder in the root `.env.example` after
starting a local PostgreSQL server and creating the `unfog` database. Alembic
does not load `.env` automatically.

```bash
export DATABASE_URL='postgresql+psycopg://unfog:change-me@localhost:5432/unfog'
alembic -c alembic.ini upgrade head
alembic -c alembic.ini current
```

## FastAPI application

`DATABASE_URL` is required. `APP_ENV` accepts `development`, `test`, or
`production` and defaults to `development`. `READINESS_TIMEOUT_SECONDS` is an
integer from 1 to 3 and defaults to 3. Settings are read from the process
environment; the application does not load `.env` itself.

Run the factory with Uvicorn from this directory:

```bash
uvicorn app.main:create_app --factory --no-access-log
```

`GET /health` returns `{"status":"ok"}` while the process is alive. `GET /ready`
runs a bounded `SELECT 1` against PostgreSQL and returns
`{"status":"ready"}` or a safe `503` error envelope. Every HTTP response
includes an `X-Request-ID` UUIDv4. Error responses use the versioned envelope
in `../docs/contracts/api-responses.v1.schema.json`.

The app factory disposes its SQLAlchemy engine during shutdown. Request logs are
JSON and include request IDs and status metadata; access paths, queries, request
bodies, source text, and exception details are omitted.

## Background workers

The worker app reads `REDIS_URL` and the bounded task/retry settings listed in
the root `.env.example`. PostgreSQL remains authoritative for job state; Redis
messages contain only the UUIDv4 job ID. There is no public task submission
route yet. The internal `submit_echo_job` service persists a job first and
publishes the same UUID as the Celery task ID. A caller retrying submission must
reuse that job ID.

For a local stack from the repository root:

```bash
docker compose up --build -d postgres redis
docker compose run --rm api alembic upgrade head
docker compose up --build api worker
```

The `api` and `worker` services are included in `compose.yaml`; starting only
PostgreSQL and Redis first allows the initial migration to run explicitly. The
Compose credentials and published ports are for local development only. Do not
reuse them outside a local machine. To run processes from a Python environment
instead, set `DATABASE_URL` and `REDIS_URL`, then use:

```bash
uvicorn app.main:create_app --factory --no-access-log
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO
```

Celery uses late acknowledgements, one prefetched task per worker, bounded
soft/hard time limits, and bounded exponential retry delays with jitter. Every
delivery opens and closes its own SQLAlchemy sessions. Duplicate deliveries
lock and inspect the same PostgreSQL job; terminal or already-running records
are not executed again. A worker killed after it commits `running` may leave a
stale job; `list_stalled_jobs` reports only old queued/running UUIDs for
operator diagnosis. Operators can explicitly requeue a stale running record
with `requeue_stalled_job`, then submit the same job UUID again. Automatic
requeue is deliberately not enabled.

Run backend tests and quality checks from this directory:

```bash
python -m ruff check .
python -m ruff format --check .
python -m mypy app
python -m pytest
```

For the live PostgreSQL migration and constraint check, set
`UNFOG_TEST_POSTGRES_URL` to an isolated test database URL and run:

```bash
python -m pytest -v
```

This runs the app readiness probe against PostgreSQL and the migration/constraint
integration tests. The persistence test migrates the database down to `base`;
use only a disposable test database.

The worker integration test also starts an embedded Celery worker and requires
disposable Redis. Set `UNFOG_TEST_REDIS_URL` and `REDIS_URL` alongside the
PostgreSQL test URL, then run `python -m pytest -v`. CI starts both services.

IDs are generated in Python with `uuid.uuid4()` and stored using SQLAlchemy's
UUID type, which maps to PostgreSQL's native `UUID`. Use `created_at` (and UUID
as a deterministic tiebreaker) for chronology. Snapshot identity fields are
immutable; create a new snapshot for each repository revision.
