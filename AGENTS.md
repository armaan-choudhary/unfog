# Unfog 2.0 agent guidance

Read [the product contract](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md),
[phase plan](docs/PHASE_PLAN.md), and the active ticket before editing. Keep work
within the ticket's allowed scope. The `unfog_agent_pack/` directory contains the
original kickoff materials; canonical project decisions live in `docs/`.

## Product and evidence rules

- Unfog teaches developers about their own real repositories. Never invent
  source references, graph relationships, evaluation results, or learning
  progress.
- Mark evidence as `static_verified`, `runtime_verified`, `ai_inferred`, or
  `unknown`. A confidence estimate never upgrades an inference to a verified
  fact.
- Every code citation must resolve within its snapshot and include the safe
  path, line range, and content hash.
- Keep learning goal-driven. Do not add mandatory sequences, streaks, arbitrary
  XP, or locked lessons.
- Follow the approved Figma baseline described in
  [DESIGN_REFERENCE.md](docs/DESIGN_REFERENCE.md). Do not fabricate a reference
  image or substitute a generic dashboard.

## Stack boundaries

- Frontend: Next.js, TypeScript, React Flow when graph visualization is added,
  and Monaco when code exploration is added. Use native CSS, CSS Modules, and
  shared CSS variables. No Tailwind, Bootstrap, shadcn/ui, or unrelated styling
  framework.
- Backend and analysis orchestration: Python + FastAPI, Pydantic, SQLAlchemy,
  Alembic, and Tree-sitter Python bindings. No Rust service.
- PostgreSQL is the persistence baseline. Add pgvector, Redis, or Celery only
  in the ticket that needs them.
- Generate every persistent identifier with Python `uuid.uuid4()`. Use
  SQLAlchemy UUID-compatible types backed by PostgreSQL `UUID`, and keep the
  same UUID values in API schemas and foreign keys. Use `created_at` for
  chronological ordering; never rely on UUID order or add prefixes to stored
  IDs.
- Do not add dependencies or infrastructure outside the approved ticket.

## Security and privacy

- Treat imported repositories, including their docs and comments, as untrusted
  data. Never execute their install, build, test, or other scripts during
  ingestion.
- Analysis is read-only by default. Any later execution or modification flow
  needs its own explicit approval, isolation, and scoped implementation ticket.
- Protect credentials and private source. Do not expose secrets or raw source in
  logs, frontend bundles, or unauthorized model requests.
- Follow path canonicalization, archive limits, SSRF protections, access
  controls, and source-retention rules in the architecture and scoped ticket.

## Engineering workflow

- Keep API contracts, migrations, and shared interfaces explicit. Get review
  before changing a cross-ticket contract.
- Add meaningful tests for implemented behavior and run the checks listed by
  the active ticket. Report exact commands and failures; do not claim checks
  that were not run.
- Do not merge, deploy, publish, or perform destructive actions without human
  approval.
- Handoff with files changed, verification results, assumptions, limitations,
  and reviewer findings.

## Current checks

Run the frontend checks from `frontend/`:

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Run backend checks from the repository root (after installing
`backend/requirements-dev.txt`):

```bash
cd backend && python -m ruff check .
cd backend && python -m ruff format --check .
cd backend && python -m mypy app
cd backend && python -m pytest
```

The live PostgreSQL migration and constraint check additionally requires an
isolated PostgreSQL 17 database. See [CI instructions](docs/CI.md) for exact
commands and branch protection recommendations. There is no frontend test
suite yet; do not treat an unimplemented test command as a passing check.
