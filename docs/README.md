# Project documentation

- [Product contract](PRODUCT.md) — capabilities, evidence requirements, and
  learning principles.
- [Architecture](ARCHITECTURE.md) — service boundaries, source provenance,
  security, and deferred decisions.
- [Phase plan](PHASE_PLAN.md) — complete implementation plan and ticket/phase
  details.
- [Design reference](DESIGN_REFERENCE.md) — approved visual constraints and
  measurements and token proposal from the supplied screenshot.
- [ADR template](ADR/TEMPLATE.md) — format for recording reviewed architecture
  decisions.
- [Contracts](contracts/README.md) — versioned source-graph, citation, API
  error, and asynchronous job response drafts.
- [CI and review gates](CI.md) — local verification commands and recommended
  repository settings.
- [Repository ingestion security](SECURITY.md) — untrusted source handling
  requirements.
- [P0-05 CI/review gates](tasks/P0-05-ci-review-gates.md) — original Phase 0
  scope and implementation record.
- [P1-01 FastAPI foundation](tasks/P1-01-fastapi-foundation.md) — application
  factory, configuration, health/readiness, errors, and request logging.
- [P1-02 persistence](tasks/P1-02-persistence-setup.md) — initial persistence
  implementation and verification status.

The kickoff copies remain under `../unfog_agent_pack/` as supplied source
materials. For active implementation, use the canonical documents above and
the root [AGENTS.md](../AGENTS.md).
