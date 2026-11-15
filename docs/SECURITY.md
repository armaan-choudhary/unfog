# Repository ingestion security notes

## Authentication and ownership

API access tokens are verified against the configured OIDC issuer, audience,
JWKS, expiry, required scope, and asymmetric signing algorithm allowlist. Email
claims are optional profile data and do not affect authentication. Production requires
HTTPS issuer/JWKS configuration. Users are keyed only by the immutable
`(issuer, subject)` identity pair; email is profile data and is never used to
link accounts. Local bearer authentication is available only with the explicit
`UNFOG_DEV_AUTH_ENABLED` development flag and a configured secret. Identity
headers are not trusted.

Repository, snapshot, and job reads filter through the owning user. A missing
resource and a resource owned by another user return the same not-found
response. Do not include source locators or raw job failure details in these
responses or request logs. Existing users are preserved during identity
migration and are not automatically linked to an OIDC identity.
Verified email collisions are discarded rather than used to link identities.

These controls cover the current read endpoints. Every future repository,
snapshot, and job endpoint must apply the same owner-scoped lookup before
returning or changing data.

## Repository ingestion security notes

Treat repository files, names, documentation, comments, and generated metadata
as untrusted input. Repository text can contain prompt injection or malicious
instructions; it does not grant authorization to run code or reveal private
data.

- Never run imported install, build, test, or other scripts during analysis.
- Canonicalize paths and reject traversal, escaping symlinks, and unsafe archive
  entries; enforce file-count, size, and decompression limits.
- Restrict remote fetch protocols and destinations, validate redirects, and
  defend against SSRF. Do not inherit ambient credentials into fetch processes.
- Exclude or redact credentials and sensitive files before model egress. Keep
  private source, tokens, and provider credentials out of logs and frontend
  bundles.
- Enforce project ownership on every source and snapshot lookup. Record source
  retention and deletion behavior before retaining imported content.
- Keep analysis read-only by default. Any future execution feature needs a
  separately reviewed ticket, explicit user authorization, and isolation.

These are implementation requirements, not proof that a scanner or future
ingestion path is safe. Add focused security tests as ingestion capabilities are
introduced.
