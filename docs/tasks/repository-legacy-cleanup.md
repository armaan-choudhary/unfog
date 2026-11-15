# Repository Legacy Rust/Vite Cleanup

## Audit and scope

The published baseline included an older Rust product and Vite/Tailwind
prototype alongside the approved Unfog 2.0 implementation. Current application
documentation and CI use `frontend/` (Next.js + TypeScript) and `backend/`
(FastAPI). No active Unfog 2.0 code, tests, or workflow referenced Cargo,
`crates/`, `web/`, the old launcher, or its sample fixture.

The cleanup removed 84 legacy files from `crates/`, `web/`,
`tests/fixtures/sample-app/`, `Dev/`, and the Rust-era root configuration and
launcher. It also removed the obsolete Rust `target/` ignore rule. No active
Unfog 2.0 code or CI configuration was removed. Historical commits and both
feature branches were preserved.

## Review and integration

- Cleanup branch: `cleanup/remove-legacy-rust-web`.
- PR [#2](https://github.com/armaan-choudhary/unfog/pull/2) merged into
  `master` on 2026-11-15 with a merge commit
  (`cae372ccc1d6873551b94d5b966874813130f2bc`).
- PR checks passed: frontend lint/format/typecheck/build, Python 3.11 and 3.14
  quality/tests, and PostgreSQL 17 migrations/constraints.
- A clean local `master` checkout passed frontend lint, formatting, typecheck,
  and production build; backend Ruff lint/format, mypy, and live PostgreSQL 17 +
  Redis 7 tests (35 passed, 2 subtests passed).
- After both merges, `frontend/`, `backend/`, CI, documentation, and the
  required configuration remained present. `crates/`, `web/`, and the root
  Cargo files were absent.

## Outstanding dependency advisory

`npm audit` reports 7 moderate advisory instances for transitive `minimatch`
versions used through the TypeScript ESLint dependency tree. The advisory is
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), a
potential denial of service through globparts amplification. No automatic
dependency updates were applied.
