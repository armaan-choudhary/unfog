# CI and review gates

GitHub Actions runs on every pull request and pushes to `main` or the current
`master` branch. Its independent jobs produce four required check runs because
the backend quality job covers two Python versions:

- **Frontend / lint, format, typecheck, build** installs from the npm lockfile,
  runs ESLint and Prettier, checks TypeScript, then creates a production build.
- **Backend / Python 3.11 quality and tests** and **Backend / Python 3.14 quality
  and tests** are separate matrix check runs. Each installs
  `backend/requirements-dev.txt`, runs Ruff lint and format checks, runs mypy,
  and executes pytest. Pytest discovers the existing unittest test cases.
- There is no frontend test suite yet, so CI does not report a placeholder
  frontend test pass.
- **Backend / PostgreSQL 17 migrations, constraints, and worker integration**
  starts disposable PostgreSQL and Redis services with test-only credentials
  and runs the backend suite with live integration enabled. It checks API
  readiness, migrations and constraints, native UUID columns, database-enforced
  snapshot immutability, and Celery execution against Redis.

The workflow grants only `contents: read`. It has no production credentials,
deployment, release, merge, or repository-write step. The PostgreSQL username
and password exist only inside the disposable test service.

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

Then, with a Python 3.11 or 3.14 virtual environment:

```bash
python -m pip install -r backend/requirements-dev.txt
cd backend
python -m ruff check .
python -m ruff format --check .
python -m mypy app
python -m pytest
```

Run the live PostgreSQL check against a disposable local PostgreSQL 17 database
(the test migrates that database down to `base`):

```bash
export UNFOG_TEST_POSTGRES_URL='postgresql+psycopg://unfog_test:unfog_test@localhost:5432/unfog_test'
cd backend
python -m unittest tests.persistence.test_postgres_live -v
```

Do not point the integration test at a database containing user data.

## Branch protection recommendations

For the default branch, require pull requests, require all four check runs
(Frontend, Backend on Python 3.11, Backend on Python 3.14, and PostgreSQL 17 + Redis),
require at least one human approval, dismiss stale approvals after new commits,
require conversation resolution, and block force pushes and branch deletion.
Keep automatic merge disabled. Apply equivalent settings to `main` and `master`
if both are active. These host-side settings require repository administrator
permissions and are intentionally not changed by this ticket.
