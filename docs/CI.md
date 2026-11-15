# CI and review gates

GitHub Actions runs on every pull request and pushes to `main` or `master`.
Independent jobs check the frontend, backend on Python 3.11 and 3.14, and the
PostgreSQL 17 migration and constraint integration suite.

- **Frontend / lint, format, typecheck, build** installs from the npm lockfile,
  runs ESLint and Prettier, checks TypeScript, then creates a production build.
- **Backend / Python 3.11 quality and tests** and **Backend / Python 3.14 quality
  and tests** are separate matrix check runs. Each installs
  `backend/requirements-dev.txt`, runs Ruff lint and format checks, runs mypy,
  and executes pytest.
- **Backend / PostgreSQL 17 migrations and constraints** starts a disposable
  PostgreSQL service with test-only credentials and runs the backend suite with
  live integration enabled. It checks API readiness, migration upgrade and
  downgrade, UUID columns, foreign-key constraints, repository/snapshot
  integrity, and database-enforced snapshot immutability.

The workflow grants only `contents: read`. It has no production credentials,
deployment, release, merge, or repository-write step. PostgreSQL credentials
exist only inside the disposable test service.

## Local verification

From the repository root:

```bash
cd frontend
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Then, with Python 3.11 or 3.14:

```bash
python -m pip install -r backend/requirements-dev.txt
cd backend
python -m ruff check .
python -m ruff format --check .
python -m mypy app
python -m pytest
```

Run live PostgreSQL checks only against an isolated disposable database. The
integration test migrates that database down to `base`:

```bash
export UNFOG_TEST_POSTGRES_URL='postgresql+psycopg://unfog_test:unfog_test@localhost:5432/unfog_test'
cd backend
python -m pytest -v
```

## Branch protection recommendations

Require pull requests, all four CI check runs, at least one human approval,
conversation resolution, and stale approval dismissal. Block force pushes and
branch deletion; keep automatic merge disabled. Apply protection to the active
default branch. These host-side settings require administrator permissions.
