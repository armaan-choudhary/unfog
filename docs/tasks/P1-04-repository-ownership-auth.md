# P1-04 — Repository ownership and authentication

**Status:** implementation complete; review pending
**Branch:** `task/P1-04-repository-ownership-auth`
**Base:** `01095ff0df7607cc4ad1bb147acd5a8892d4cff0`
**Dependencies:** P1-02 persistence; approved provider-neutral OIDC JWT decision

## Delivered

- Added provider-neutral JWT bearer verification using `PyJWT[crypto]` and
  `PyJWKClient`. Verification requires a valid signature under the configured
  asymmetric algorithm allowlist, exact issuer and audience, expiry, subject,
  verified email, and a string `scope` claim. JWKS lookups use the configured
  bounded timeout. Invalid tokens return the standard `unauthenticated`
  envelope; JWKS connectivity failures return a safe retryable 503.
- Added environment settings for issuer, audience, JWKS URL, allowed
  algorithms, and timeout. Production requires the complete HTTPS OIDC
  configuration. Local bearer authentication requires an explicit development
  flag and a configured 32-character secret; it is rejected in test and
  production environments. `X-User-ID` is ignored.
- Users are found only by `(auth_issuer, auth_subject)`. Email is not used to
  identify or link accounts. A unique-email conflict fails authentication
  without disclosing the existing account.
- Added a migration for nullable OIDC identity columns, a unique pair
  constraint, an all-or-none pair check, and database triggers that prevent
  changing an assigned identity. Existing user and repository rows are
  preserved by upgrade and downgrade.
- Added reusable authentication/scope dependencies and centralized owner
  queries for repositories, snapshots, and jobs. The read endpoints return the
  same `not_found` envelope for absent and non-owned resources. Repository
  source URIs and raw job error messages are excluded from responses.
- Added configuration, token, JWKS outage, local auth, account matching,
  authorization, response, and logging tests. Updated the backend README,
  environment example, and security notes.

## Migration

`0002_user_oidc_identity` adds `auth_issuer` and `auth_subject` to `users` as
nullable columns. Existing data remains valid and no ownership foreign keys or
snapshot constraints change. PostgreSQL and SQLite enforce the pair check,
uniqueness, and identity immutability at the database layer. Downgrade removes
the identity fields and triggers while preserving pre-existing users and
repository ownership.

## Verification

- `python -m ruff check .`: passed.
- `python -m ruff format --check .`: passed.
- `python -m mypy app`: passed on Python 3.14.8.
- Full backend suite against disposable PostgreSQL 17 and Redis: 54 passed,
  2 subtests passed. The live PostgreSQL migration/constraint test passed,
  including PostgreSQL UUID types, owner/repository integrity, direct SQL
  identity immutability and pair constraints, and downgrade data preservation.
- Frontend lockfile install succeeded. ESLint, Prettier, TypeScript, and the
  Next.js production build passed; the frontend was not changed.
- `npm ci` reported seven moderate dependency advisories; no dependency
  upgrades were applied.
- GitHub Actions results: pending publication and execution.

## Limitations and follow-up boundaries

- No commercial identity provider has been selected. A deployment must supply
  its issuer, audience, and JWKS URL before production startup.
- The current user schema requires a unique email. Tokens without a verified
  email are rejected. Existing users are not auto-linked; a reviewed account
  recovery/linking flow is future work.
- Only read endpoints for repository, snapshot, and job resources are included.
  Creation, mutation, repository import, analysis, and frontend authentication
  flows remain out of scope.
- JWT access tokens are checked for the `repositories:read` scope by these
  endpoints. Provider-specific scope claim mapping has not been selected.
