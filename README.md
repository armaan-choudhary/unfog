# Unfog 2.0

Unfog helps developers understand their own codebases through source-grounded
architecture maps and goal-driven learning. The canonical product contract,
architecture, and phased plan are in [`docs/`](docs/README.md).

## Repository layout

- `frontend/` — Next.js and TypeScript web application; native CSS and CSS
  Modules only.
- `backend/` — Python API and repository-analysis services.
- `docs/` — product, architecture, design, and implementation documentation.
- `e2e/` — end-to-end checks, to be configured in a later Phase 0 ticket.

The current checkout contains the frontend scaffold and initial persistence
models and migration. It does not yet implement repository import, analysis, or
learning features.

## Prerequisites

- Node.js 20.9 or newer and npm.
- Python 3.11 or newer for backend setup.

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>. The page is a scaffold status screen, not the
approved product dashboard. Run `npm run lint`, `npm run format:check`,
`npm run typecheck`, and `npm run build` for local quality checks. A frontend
test suite has not been introduced yet.

## Backend

The backend has a FastAPI application factory, SQLAlchemy models, and an
Alembic migration for the initial persistence entities. Install dependencies
from `backend/`, set `DATABASE_URL` to a local PostgreSQL database, then run
Uvicorn from `backend/` with `uvicorn app.main:create_app --factory --no-access-log`.
See [backend setup](backend/README.md) for details.

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

On Windows PowerShell, activate with `.venv\\Scripts\\Activate.ps1`.

See [CI and review gates](docs/CI.md) for backend verification commands,
PostgreSQL integration checks, and branch protection recommendations.

## Local configuration

Copy `.env.example` to `.env` for local settings. Do not commit `.env` or put
provider credentials in source control. The frontend scaffold needs no database;
backend persistence commands require a local PostgreSQL database. Queue and
external AI services are not required yet.

## Product and engineering constraints

- AI claims and code references must be grounded in the imported repository and
  carry explicit provenance.
- Imported source is untrusted; never run its install, build, or test scripts
  during analysis without explicit authorization and isolation.
- Learning is goal-driven. No forced sequences, streaks, or artificial XP.
- Keep the approved dark/violet Figma design as the UI source of truth once the
  reference is supplied.
