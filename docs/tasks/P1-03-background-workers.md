# P1-03 — Celery + Redis background workers

**Status:** implementation and local live integration complete; awaiting review<br>
**Dependencies:** P1-01 FastAPI foundation and P1-02 persistence<br>
**Schema changes:** none; the existing P1-02 `jobs` model and migration are preserved.

## Architecture

- Added an environment-configured Celery application using Redis as its broker.
  Messages are JSON-only, results are ignored, late acknowledgements are
  enabled, workers prefetch one message, and hard/soft timeouts and bounded
  exponential retries use validated settings.
- PostgreSQL remains authoritative. The internal `submit_echo_job` service
  inserts a `Job` first, then publishes its UUIDv4 as both the Celery task ID
  and the only task argument. A caller retry reuses that ID; a retry cannot
  create another persistent job. Queue publication failure is recorded on the
  same row and can be recovered by resubmitting the same ID.
- The task locks and transitions the existing row through `queued` → `running`
  → `succeeded` or `failed`; transient failures requeue the same row and
  increment its existing `retry_count`. Duplicate deliveries stop when they
  see a running or terminal job. No Celery result backend is used.
- Each task stage uses a fresh SQLAlchemy session, closed at the end of its
  operation. Celery's warm shutdown is retained and logged; late acknowledgments
  and worker-loss rejection let Redis redeliver work after a worker disappears.
- The synthetic `echo_job` performs only a bounded no-op pipeline check, uses
  the existing allowed `analysis` job type, and marks completion in PostgreSQL.
  No repository content is read or executed.
- Worker logs allow-list event, job UUID, retry count, and request correlation
  ID. Exceptions are not logged or persisted; failures use fixed safe codes and
  summaries. Stalled job diagnostics return UUIDs only. Operators can inspect
  them and explicitly requeue a stale running job; no automatic scheduler or
  unauthenticated execution endpoint was added.

## Files created or modified

- `backend/app/workers/config.py` — typed Redis and task/retry settings.
- `backend/app/workers/celery_app.py` — Celery factory and CLI app.
- `backend/app/workers/jobs.py` — internal submission, safe transitions,
  broker failure recovery, and stalled-job operations.
- `backend/app/workers/tasks.py` — idempotent synthetic worker task and task
  shutdown logging.
- `backend/tests/workers/` — unit coverage and live Redis/PostgreSQL worker
  integration test.
- `backend/requirements.txt` — Celery Redis transport dependency.
- `backend/Dockerfile`, `compose.yaml` — local API, PostgreSQL, Redis, and worker
  services.
- `.env.example`, `backend/README.md`, `docs/CI.md` — worker settings, commands,
  and CI integration services.
- `.github/workflows/ci.yml` — added disposable Redis to the PostgreSQL
  integration job and enabled the live worker test.
- `backend/app/core/logging.py` — allow-listed job/retry log fields.
- `.gitignore` — ignores root `dev/` and `Dev/` local directories, as requested.

## Local development

From the repository root:

```bash
docker compose up --build -d postgres redis
docker compose run --rm api alembic upgrade head
docker compose up --build api worker
```

Alternatively, install `backend/requirements-dev.txt`, set `DATABASE_URL` and
`REDIS_URL`, and run the API and worker from `backend/`:

```bash
uvicorn app.main:create_app --factory --no-access-log
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO
```

Compose credentials are local-only placeholders. No production credential is
required. There is intentionally no public job submission API yet.

## Job lifecycle and recovery

| Event | PostgreSQL state |
|---|---|
| Submitted | `queued`, progress 0 |
| Claimed by worker | `running` |
| Successful bounded task | `succeeded`, `COMPLETE`, progress 100 |
| Retryable failure with budget remaining | back to `queued`, retry count incremented |
| Retry budget exhausted | `failed`, safe `worker_execution_failed` summary |
| Redis publish unavailable | `failed`, safe `queue_unavailable` summary |
| Redis returns | resubmit using the same job UUID; row is returned to `queued` |
| Stale running job | appears in `list_stalled_jobs`; operator may explicitly requeue same UUID |

## Verification

- Python 3.14 local suite without service access: **32 passed, 3 skipped, 2
  subtests passed**. The skipped tests require disposable PostgreSQL and Redis.
- Live PostgreSQL 17 + Redis 7 integration suite using disposable Docker
  containers: **35 passed, 2 subtests passed**. This included PostgreSQL-backed
  migrations/constraints and a real Celery worker consuming a Redis message and
  recording success in PostgreSQL.
- Ruff lint and format checks: passed.
- mypy application checks: passed.
- Live containers were stopped after verification.
- Python 3.11 was not available in the local interpreter; CI retains the
  project's Python 3.11/3.14 matrix. GitHub Actions has not run for this branch.
- The sandbox initially blocked access to the published Docker ports; the live
  run completed after running the approved disposable-service test command with
  host access.

## Security, limitations, and decisions

- Broker credentials are excluded from settings representations, task payloads,
  and structured worker logs. Source code, exception details, and secrets are
  not persisted in job failure summaries.
- Worker tasks are private internal code; no API endpoint accepts task names or
  arbitrary arguments. The current service accepts only repository/snapshot
  identifiers and submits a fixed task.
- At-least-once broker delivery is expected. The DB row lock and state checks
  protect duplicate delivery for this bounded task. Future long-running tasks
  must retain idempotency and should define lease/heartbeat semantics before
  holding `running` state for long periods.
- A hard worker kill after `running` commits leaves a stale row for explicit
  diagnosis/requeue. No periodic scheduler, Celery Beat, result backend,
  repository processing, LLM integration, or schema migration was introduced.
- Local Git inspection found an active repository on `master` at start, with no
  configured remote. Work is on `task/P1-03-celery-redis-workers`; nothing was
  pushed and no remote settings were changed. The pre-existing worktree had
  unrelated deletions and untracked project files; they were left out of the
  P1-03 commit.
