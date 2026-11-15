# Unfog 2.0 — Agent handoff

**Verified baseline:** `master` at `43d4f41ffb6589ac1d2826ba21c026efd7599e7e`
**Verified:** 2026-11-15
**Next checkpoint:** P1-05 — OpenAPI & CORS

## Product goal

Unfog helps developers understand the specific code they own. Its long-term
product combines repository-grounded architecture maps, user-chosen learning
goals, interactive challenges, evidence-based understanding evaluation,
semantic code exploration, and change-aware refreshes. The product has eight
planned AI capabilities: Project Autopsy, Codebase World Generator,
Goal-to-Journey Generator, Dynamic Challenge Generator, AI Learning Companion,
Understanding Evaluator, Semantic Code Explorer, and Code Time Machine.

The platform must distinguish verified source facts from AI inferences. Never
fabricate files, relationships, citations, mastery, or progress. Keep learning
goal-driven; do not add mandatory sequences, streaks, arbitrary XP, or locked
lessons. The approved dark Figma reference is
[`docs/references/approved-dashboard.png`](references/approved-dashboard.png),
with design constraints in `docs/DESIGN_REFERENCE.md`.

## Locked technology and architecture

- **Web:** Next.js, React, and TypeScript; native CSS, CSS Modules, and shared
  CSS variables. React Flow (`@xyflow/react`) is planned for maps; Monaco is
  planned for read-only code exploration. Neither is integrated yet.
- **Backend:** Python 3.11 and 3.14, FastAPI, Pydantic, SQLAlchemy 2, Alembic.
  Repository indexing is Python-owned. Tree-sitter Python bindings are planned
  for syntax analysis but are not integrated yet.
- **Data:** PostgreSQL is authoritative. Persistent IDs are Python `uuid.uuid4`
  UUIDv4 values stored as PostgreSQL native `UUID`; use `created_at` for
  chronology. Snapshots preserve immutable source identity.
- **Workers:** Celery + Redis are implemented for internal background work.
  PostgreSQL remains authoritative for job status. pgvector is deferred until
  semantic retrieval demonstrates a need.
- **Runtime AI:** use a provider-neutral adapter and enforce privacy, evidence,
  budget, and output-validation controls. Gemini is the planned prototype
  provider; no Gemini or other LLM integration exists in this baseline.
- **Explicit exclusions:** no Rust service, Tailwind, Bootstrap, shadcn/ui,
  imported-repository script execution, or automatic deployment/merge.

Canonical decisions are in `AGENTS.md`, `docs/PRODUCT.md`,
`docs/ARCHITECTURE.md`, and `docs/PHASE_PLAN.md`.

## Completed work

### Phase 0 — repository and agent foundation

P0-01 through P0-05 are complete: monorepo baseline, project instructions and
architecture/product docs, approved Figma reference, ticket/error contracts,
and GitHub CI/review gates. P0-05's record is
`docs/tasks/P0-05-ci-review-gates.md`.

### Phase 1 — backend foundation through P1-04

- **P1-01:** FastAPI application factory and lifecycle, environment settings,
  liveness/readiness, standard error envelope, request IDs, and structured
  redacted logging. Record: `docs/tasks/P1-01-fastapi-foundation.md`.
- **P1-02:** SQLAlchemy users, repositories, snapshots, and jobs; UUIDv4; owner
  and snapshot integrity constraints; immutable snapshot identity; Alembic
  migration `0001_initial_persistence`. Record:
  `docs/tasks/P1-02-persistence-setup.md`.
- **P1-03:** Celery + Redis worker entry point, persistent job lifecycle,
  idempotent echo task, bounded retries/timeouts, and local worker integration.
  Record: `docs/tasks/P1-03-background-workers.md`.
- **P1-04:** provider-neutral OIDC JWT bearer verification, user identity
  persistence, and owner-filtered repository/snapshot/job read routes. PR #4 is
  merged. Record: `docs/tasks/P1-04-repository-ownership-auth.md`.

P1-05 and later tickets remain unimplemented. The frontend is still a small
Next.js scaffold, not the approved product dashboard. Repository ingestion,
parsing, graph construction, learning flows, and AI features are not present.

## Current persistence, API, and workers

### Database

Models are in `backend/app/db/models.py`; engine/session setup is in
`backend/app/db/session.py`. Alembic revisions are:

- `backend/alembic/versions/0001_initial_persistence.py`
- `backend/alembic/versions/0002_user_oidc_identity.py`

The current tables are `users`, `repositories`, `snapshots`, and `jobs`. User
email is optional, unique when non-null, and profile-only. A user identity is
the immutable `(auth_issuer, auth_subject)` pair. A repository has an owner;
snapshots are unique per repository revision and protect their source identity;
jobs cannot point to a snapshot from a different repository. The second
migration refuses downgrade while email-less users exist rather than inventing
an email or losing the user identity.

There are no source-file, symbol, edge, citation, feature-region, learning, or
AI-output tables yet.

### API

Application setup and error handling are in `backend/app/main.py`; routers are
in `backend/app/api/`. Current routes are:

- `GET /health`
- `GET /ready`
- `GET /repositories/{repository_id}`
- `GET /repositories/{repository_id}/snapshots/{snapshot_id}`
- `GET /repositories/{repository_id}/jobs/{job_id}`

The three resource reads require `repositories:read`. Central ownership
queries live in `backend/app/api/ownership.py`; auth dependencies and OIDC
verification live in `backend/app/core/auth.py`. Missing and non-owned
resources both return the same `not_found` envelope. Repository source URIs
and raw job error messages are not returned. All HTTP responses carry an
`X-Request-ID`.

The current resource URLs are not prefixed with `/api/v1`; the master plan
expects versioned routes. Resolve that contract in P1-05 before adding clients.
FastAPI currently generates a runtime OpenAPI document, but client-safe schema
publication and CORS policy have not been formalized.

### Background jobs

Worker modules are under `backend/app/workers/`: `celery_app.py`, `config.py`,
`jobs.py`, and `tasks.py`. Run a worker with:

```bash
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO
```

`submit_echo_job` is an internal service; no public task submission endpoint
exists. The message carries the persistent UUID job ID. Duplicate deliveries
are guarded by PostgreSQL state/locking; stale running jobs require explicit
diagnosis and requeue. Do not add repository cloning or analysis to this
synthetic task.

## Authentication and security

- `PyJWT[crypto]` verifies JWT signature, configured asymmetric algorithm,
  issuer, audience, expiry, subject, and the required `scope` claim. JWKS
  requests use a bounded configured timeout.
- Email and `email_verified` are optional claims. Only a verified email is
  stored as profile data; an email collision is discarded. Email never
  identifies or links accounts. Existing users are not auto-linked.
- Production requires OIDC issuer, audience, and JWKS URL, with HTTPS issuer
  and JWKS URLs. No commercial identity provider is selected yet.
- Local bearer auth needs a configured secret of at least 32 characters, an
  explicit `UNFOG_DEV_AUTH_ENABLED=true`, and an explicitly set
  `APP_ENV=development`. It is rejected with an unset, test, or production
  environment. Never trust `X-User-ID` or other identity headers.
- Tokens, credentials, identity values, source contents, and provider details
  must not enter logs. Imported repositories are untrusted and must not be
  executed. Keep repository reads owner-scoped, read-only by default, and
  source-grounded.

Security requirements are in `docs/SECURITY.md` and `AGENTS.md`.

## Repository map

- `AGENTS.md` — instructions that every coding agent must follow.
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/PHASE_PLAN.md` — canonical
  product, architecture, and ticket plan.
- `docs/DESIGN_REFERENCE.md` and `docs/references/approved-dashboard.png` —
  approved UI reference.
- `docs/contracts/` — API error/job and source-graph contracts.
- `docs/tasks/` — completed ticket records and implementation evidence.
- `frontend/` — Next.js app, currently scaffold only.
- `backend/app/` — FastAPI API, auth, persistence, and worker code.
- `backend/alembic/` — migration environment and revisions.
- `.github/workflows/ci.yml`, `docs/CI.md` — CI jobs and local checks.
- `compose.yaml` — local PostgreSQL, Redis, API, and worker service definitions.
- `.env.example` — local placeholders; never commit `.env` or real secrets.

The root `README.md` still describes an earlier, less complete baseline; use
this handoff, the backend README, and the task records for current status.

## Local setup and commands

The application does not load `.env` automatically. Set or export values in
each API/worker shell. Compose's PostgreSQL and Redis credentials are for local
development only.

Start the data services from the repository root:

```bash
docker compose up -d postgres redis
```

Create the Python environment and install backend dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
```

For local protected-route work, configure a new local bearer secret in the
shell; do not put it in Git:

```bash
export APP_ENV=development
export DATABASE_URL='postgresql+psycopg://unfog:local-only-change-me@localhost:5432/unfog'
export REDIS_URL='redis://localhost:6379/0'
export UNFOG_DEV_AUTH_ENABLED=true
export UNFOG_DEV_AUTH_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export UNFOG_DEV_AUTH_EMAIL='developer@example.test'
```

Run the migration and API from `backend/`:

```bash
cd backend
alembic -c alembic.ini upgrade head
uvicorn app.main:create_app --factory --no-access-log
```

In a second shell, export the same database and Redis values (local auth is not
needed by the worker) and run from `backend/`:

```bash
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO
```

Run the frontend in another shell:

```bash
cd frontend
npm ci
npm run dev
```

The documented Compose API/worker build currently needs a Dockerfile correction:
`backend/Dockerfile` copies `migrations/`, but migration files are under
`backend/alembic/versions/`. Start PostgreSQL/Redis with Compose and run API and
worker from the Python environment above until this local image-build issue is
fixed. Compose also does not currently pass OIDC/local-auth settings to the API.

## Verification and GitHub CI

From `frontend/`:

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
```

From `backend/`:

```bash
python -m ruff check .
python -m ruff format --check .
python -m mypy app
python -m pytest
```

The full live suite needs a disposable PostgreSQL 17 database and Redis; set
`UNFOG_TEST_POSTGRES_URL`, `UNFOG_TEST_REDIS_URL`, and `REDIS_URL` before
`python -m pytest`. Persistence integration tests migrate the supplied
database down to `base`; never point them at user data.

GitHub Actions reports four checks: frontend lint/format/typecheck/build,
backend Python 3.11, backend Python 3.14, and PostgreSQL 17 + Redis integration.
PR #4 passed all four on its final head; the merge-to-master run also passed:

- PR run: [43720360892](https://github.com/armaan-choudhary/unfog/actions/runs/43720360892)
- Master push: [43720465846](https://github.com/armaan-choudhary/unfog/actions/runs/43720465846)

The clean-checkout verification at `43d4f41ffb6589ac1d2826ba21c026efd7599e7e`
passed 57 backend tests and 2 subtests, Ruff, mypy, `pip check`, frontend
install, ESLint, Prettier, TypeScript, and Next.js production build. There is no
frontend test suite yet. `npm ci` reports seven moderate advisories; no
automatic dependency changes were made.

## Remaining limitations and risks

- No repository ingestion, parser, source graph, learning features, or Gemini
  integration exists yet. Source-grounded AI behavior must wait for the real
  indexing/evidence pipeline.
- No commercial OIDC provider or frontend sign-in flow is selected. Existing
  users are not auto-linked. Provider-specific scope claim mapping is not
  selected; current access tokens must expose `scope`.
- Only resource read endpoints exist; there is no repository/job creation API.
- The root README is stale, and the Dockerfile migration-copy path above breaks
  the documented API/worker image build.
- Seven moderate npm advisories remain. Review package audit details during a
  dependency ticket; do not apply broad automatic upgrades.
- P1-05 must formalize `/api/v1` OpenAPI output and restricted CORS before
  browser clients depend on these routes.

## Next checkpoint — P1-05 OpenAPI & CORS

Start with the current clean `origin/master` at
`43d4f41ffb6589ac1d2826ba21c026efd7599e7e`. Read `AGENTS.md`, `docs/PRODUCT.md`,
`docs/ARCHITECTURE.md`, the P1-05 section of `docs/PHASE_PLAN.md`, current API
schemas, `docs/CI.md`, and this handoff. Create a bounded P1-05 task record and
dedicated branch before implementation. Define client-safe OpenAPI publication
and environment-driven CORS allowlists with tests; resolve the plan's `/api/v1`
prefix expectation explicitly. Do not begin repository ingestion or AI work in
that ticket. Run the checks required by the task and seek review before P1-06.

Always follow `AGENTS.md` and the master implementation plan. Preserve history,
use a clean worktree per task, avoid broad staging, and report actual test and
GitHub check results. Never merge or deploy without explicit authorization.
