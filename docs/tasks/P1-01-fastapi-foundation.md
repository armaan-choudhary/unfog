# P1-01 — FastAPI application foundation

**Status:** implementation complete; P1-02 persistence preserved
**Dependencies:** P0-04 API error contract, P0-05 CI, P1-02 persistence

## Architecture and implementation

- Added `create_app(settings, readiness_probe, routers)` with explicit lifespan
  management. Startup creates/reuses the configured SQLAlchemy engine; shutdown
  disposes it. Health and injected routers are registered through the factory.
- Added immutable typed `Settings` with environment parsing and validation for
  `DATABASE_URL`, `APP_ENV`, and `READINESS_TIMEOUT_SECONDS`. Database URLs are
  excluded from the settings representation.
- Reused the P1-02 SQLAlchemy engine, adding bounded PostgreSQL connection and
  pool timeouts. Readiness runs `SELECT 1` and a transaction-local PostgreSQL
  statement timeout; it does not require or alter application schema.
- Added Pydantic models for the approved P0-04 v1 error envelope, stable error
  codes, and application exceptions. Validation, HTTP, and unexpected errors
  return safe envelopes; request values, exception text, and stack traces are
  omitted.
- Added pure ASGI request correlation middleware. It accepts canonical UUIDv4
  `X-Request-ID` values and replaces missing or invalid values; the resulting
  ID appears in the response header, error envelope, and structured JSON logs.
- Application logs use an allow-list of fields and redact common credential
  assignments, bearer tokens, and database URL passwords. Request paths, query
  strings, bodies, raw source, and exception details are not logged.
- Added FastAPI to runtime requirements and `httpx2` as a test-only ASGI client.
  No workers, authentication, business endpoints, migrations, or model changes
  were added.

## Endpoints

| Endpoint | Success | Dependency failure |
|---|---|---|
| `GET /health` | `200 {"status":"ok"}` | Still returns 200 while the process is alive |
| `GET /ready` | `200 {"status":"ready"}` after bounded database `SELECT 1` | `503` with the v1 error envelope and a generic safe message |

All HTTP responses carry the `X-Request-ID` header. Error payloads use
`docs/contracts/api-responses.v1.schema.json`; HTTP status remains the transport
status.

## Verification

- Python 3.14 with live PostgreSQL 17: `pytest -q` — **23 passed**, including
  live API readiness, migration upgrade/downgrade, UUID column, foreign-key,
  repository/snapshot integrity, and immutability checks; 2 subtests passed.
- Python 3.11 without PostgreSQL: dependency install, Ruff lint/format, mypy,
  and `pytest -q` — **21 passed, 2 PostgreSQL-only tests skipped**, 2 subtests
  passed.
- Python 3.14 local Ruff lint/format and mypy passed; the live PostgreSQL run
  above covered the full test suite on that interpreter.
- `python -m pip check` and `git diff --check` passed.
- The API tests validate the P0-04 error example with the runtime model and
  cover configuration failures, liveness/readiness, dependency failure,
  validation/application/unexpected errors, UUID propagation, lifecycle
  disposal, and log redaction.
- PostgreSQL 17 ran in a disposable local container and was stopped after the
  test run. The existing P1-02 migration and models were preserved.

## Security and limitations

- Configuration must be supplied by the process environment; `.env` loading is
  not implicit. See `backend/README.md` for required values and the Uvicorn
  factory command.
- Run Uvicorn with `--no-access-log` so framework access logs do not emit paths
  or query strings. Application logs include only request ID, method, status,
  duration, and fixed event/message fields.
- Readiness is bounded to at most three seconds for PostgreSQL connection,
  pool checkout, and statement execution. It returns no driver error details.
- There is no authentication or business API in this ticket. The factory
  exposes router injection for later scoped implementation.
