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
