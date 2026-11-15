## Summary

<!-- What changed and why? -->

## Ticket

<!-- Link the approved task, for example docs/tasks/P0-05-ci-review-gates.md. -->

## Verification

- [ ] Frontend lint, formatting, typecheck, and production build
- [ ] Backend lint, formatting, typecheck, and tests
- [ ] PostgreSQL integration checks, when persistence or migrations are affected
- [ ] Other checks (list below)

Commands and results:

## Review checklist

- [ ] Change stays within the approved ticket and preserves documented contracts.
- [ ] Source claims and repository references are evidence-backed.
- [ ] Imported repository content is treated as untrusted and is not executed.
- [ ] No secrets, private source, or credentials are added to logs or bundles.
- [ ] No migrations, API contracts, or security controls changed without documenting compatibility.
- [ ] A human reviewer has reviewed the change; no automatic merge is configured.

## Risks or follow-up

<!-- Document limitations, rollout needs, or follow-up tickets. -->
