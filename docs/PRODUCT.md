# Unfog 2.0 product contract

## Purpose

Unfog helps a developer understand a specific real codebase: inspect its
structure, ask about any feature or function, follow supported references,
practice explaining behavior, and revisit knowledge affected by later code
changes. Repository evidence is the foundation for generated explanations and
learning material.

## Eight approved AI capabilities

1. **Project Autopsy** — summarize a repository's purpose and structure with
   source citations and explicit uncertainty.
2. **Codebase World Generator** — group evidenced symbols and files into
   navigable feature regions; keep inferred groupings distinct from verified
   source relations.
3. **Goal-to-Journey Generator** — turn a user's question into optional,
   source-linked learning steps scoped to the repository and snapshot.
4. **Dynamic Challenge Generator** — create challenges, answer keys, hints, and
   rubrics grounded in real source evidence.
5. **AI Learning Companion** — explain code and offer progressive help using
   bounded, cited repository context.
6. **Understanding Evaluator** — assess a response against a grounded rubric and
   record whether the attempt was independent, hinted, or revealed.
7. **Semantic Code Explorer** — find relevant symbols and features from natural
   language or symbol queries, with citations and uncertainty.
8. **Code Time Machine** — compare snapshots, identify changed code, and suggest
   focused revalidation of affected learning evidence.

These are approved capabilities, not claims that the current scaffold already
implements them.

## Learning and progress

- Goal-first: a user can ask about a feature directly without completing a
  compulsory syllabus.
- Steps and journeys are optional. Do not lock lessons behind prerequisites.
- Distinguish independently demonstrated understanding from assisted attempts.
- Tie progress to evidence and a code snapshot. Revisit affected evidence after
  changes without invalidating unrelated learning.
- Do not add streaks, arbitrary XP, forced quests, or percentages without a
  defined and evidence-backed denominator.

## Evidence and AI behavior

- Verified code facts must come from deterministic source analysis, a supported
  language service, an explicitly authorized runtime observation, or human
  review. Model agreement alone is not verification.
- Label provenance as `static_verified`, `runtime_verified`, `ai_inferred`, or
  `unknown`.
- A citation resolves to a real path and line range in one immutable snapshot
  and records the source content hash.
- Model-generated summaries, feature groupings, journeys, challenges, and
  evaluations must be validated against allowed repository evidence. Surface
  uncertainty and failures; never fill gaps with invented facts.

## Visual experience

The approved Figma Make dashboard is the design source of truth: a premium dark
charcoal interface, restrained violet accents, left navigation, a clear active
learning goal, an interactive architecture map, a right-side learning-goal
area, and a small contextual Nimbus mascot. Preserve hierarchy and restrained
information density. The actual reference artifact and measured visual tokens
are pending documentation in [DESIGN_REFERENCE.md](DESIGN_REFERENCE.md).

## Non-goals and safety

- Do not present hardcoded demo graphs, citations, mastery, or AI responses as
  analysis of a user's repository.
- Do not execute imported project code during normal analysis.
- Do not automatically modify a user's repository.
- Do not expose private code or credentials to a model without the applicable
  privacy setting and authorization.

See [ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries and data
provenance, and [PHASE_PLAN.md](PHASE_PLAN.md) for phased delivery.
