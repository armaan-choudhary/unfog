# P0-05 — CI, testing, and agent review gates

**Status:** implementation complete; first hosted GitHub run and repository
settings remain pending
**Dependencies:** P0-01 and P0-02
**Scope:** preserve the original Phase 0 ticket. Persistence setup is tracked
separately under [P1-02](P1-02-persistence-setup.md).

## Goal

Establish reliable CI checks and human review guidance without credentials,
automatic deployment, or automatic merging.

## Delivered

- Added `.github/workflows/ci.yml` for pull requests and pushes to `main` and
  the current `master` branch. Frontend, backend, and PostgreSQL jobs run
  independently with read-only repository permissions and no secrets.
- Frontend job installs with `npm ci`, then runs ESLint, Prettier, TypeScript,
  and a production build. No frontend test suite exists yet, so none is
  represented as a passing check.
- Backend quality job runs Ruff lint/format, mypy, and pytest on Python 3.11 and
  3.14. Pytest discovers the existing unittest tests.
- PostgreSQL 17 job starts an isolated disposable service and executes the live
  migration/constraint integration test using test-only credentials.
- Added backend dev tooling in `requirements-dev.txt` and its Ruff, pytest, and
  mypy configuration in `pyproject.toml`.
- Added GitHub task and pull request templates, [CI instructions](../CI.md),
  [repository ingestion security guidance](../SECURITY.md), and local commands
  and review recommendations to project guidance.
- Added type annotations for the SQLAlchemy snapshot immutability callback so
  the configured strict mypy check passes. Existing backend files were
  formatted and imports sorted to meet the new checks.

## Acceptance and verification record

- [x] Frontend dependency lock consistency verified with `npm ci`.
- [x] Frontend lint, formatting, and typecheck passed locally.
- [x] Frontend production build passed in Node 22, the CI runtime.
- [x] Backend dependency installation and lint, formatting, mypy, and tests
  passed in Python 3.11 and 3.14.
- [x] Live PostgreSQL 17 test passed against a disposable container. It covered
  migration upgrade/downgrade, native UUID columns, PostgreSQL foreign-key and
  repository/snapshot constraints, and database-enforced snapshot
  immutability.
- [x] GitHub Actions workflow passed `actionlint` validation.
- [x] CI has no production credentials or write permissions and contains no
  deployment or merge workflow.
- [x] PR template calls for human review; docs describe required checks and
  branch protection settings that block force pushes and deletion.

## Outstanding host-side setup

The workflow has not run on GitHub because this local task does not push a
branch or PR. Repository branch protection and auto-merge settings require
repository administrator access and were not changed. Apply the recommendations
in [CI instructions](../CI.md) and observe a successful hosted run before making
these checks mandatory.

The host currently has Node 26; Next.js 16.4.6's build-time TypeScript config
subprocess emitted no captured output under that runtime. The production build
passed in Node 22, which is what CI sets up. The TypeScript dependency is pinned
to 5.9.3 for reproducible compatibility.
