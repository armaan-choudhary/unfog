# P1-02 — Persistence setup

**Status:** complete<br>
**Dependencies:** approved P0-04 contracts and UUIDv4 decision<br>
**Implementation scope:** users, repositories, snapshots, jobs, session factory,
and initial Alembic migration.

## Approved inputs

- UUIDv4 for every persistent entity identifier, generated with Python
  `uuid.uuid4()` and stored as PostgreSQL native `UUID` columns.
- `created_at` for chronological ordering, with UUID as a deterministic
  tie-breaker.
- Immutable repository revision or content-manifest snapshots, as established
  by the approved implementation plan.

## Delivered scope

- SQLAlchemy 2 models for `users`, `repositories`, `snapshots`, and `jobs`.
- Initial Alembic migration with ownership and same-repository snapshot foreign
  keys, uniqueness, status checks, progress bounds, and query indexes.
- PostgreSQL trigger and ORM guard against changing a snapshot's source
  identity after creation.
- Environment-configured SQLAlchemy session factory and PostgreSQL driver.
- Persistence tests covering UUID generation/type, migration, uniqueness,
  cross-repository snapshot rejection, and snapshot immutability.

## Verification status

- `python -m unittest discover -s tests -v` from `backend/`: 10 tests passed,
  including SQLite migration upgrade and Alembic model parity.
- Live PostgreSQL integration: passed against a disposable PostgreSQL 17.12
  Docker container. The test upgraded and downgraded the migration; inspected
  all primary/foreign key UUID columns; inserted UUIDv4 records; and verified
  `created_at` values.
- PostgreSQL rejected a missing repository owner, a job referencing another
  repository's snapshot, and a duplicate repository/revision pair.
- A direct SQL `UPDATE` (bypassing the ORM) was rejected by the PostgreSQL
  snapshot identity trigger. Downgrade removed the tables and trigger function.
- PostgreSQL offline migration rendering and `pip check`: passed.
- Temporary database container was stopped and removed after verification.

## Deferred

- FastAPI app factory and health endpoints.
- Auth flow, import pipeline, source-file/symbol/edge/citation persistence, and
  worker infrastructure.
