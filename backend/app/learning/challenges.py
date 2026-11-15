"""Curated and dynamically generated code-understanding challenges."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.learning.schemas import Challenge


@dataclass(frozen=True)
class ChallengeDefinition:
    id: str
    type: str  # "locate" | "trace" | "predict"
    title: str
    prompt: str
    options: tuple[str, ...]
    target_path: str
    target_symbol: str
    hint: str
    correct_answer: str
    correct_feedback: str
    incorrect_feedback: str
    repo_id: str | None = None

    def to_public_challenge(self) -> Challenge:
        return Challenge(
            id=self.id,
            type=self.type,  # type: ignore[arg-type]
            title=self.title,
            prompt=self.prompt,
            options=list(self.options),
            target_path=self.target_path,
            hint=self.hint,
        )


ALL_CHALLENGES: tuple[ChallengeDefinition, ...] = (
    ChallengeDefinition(
        id="challenge-locate-auth",
        type="locate",
        title="Locate Token Verification",
        prompt="Which function is responsible for validating the incoming bearer token?",
        options=("verify_token", "hash_password", "create_session", "check_permission"),
        target_path="service/auth.py",
        target_symbol="verify_token",
        hint="Check the auth module functions.",
        correct_answer="verify_token",
        correct_feedback=(
            "Correct! verify_token in service/auth.py performs the cryptographic signature "
            "check and expiration validation."
        ),
        incorrect_feedback=(
            "Incorrect. '{answer}' is not responsible for validating incoming bearer tokens. "
            "Look in service/auth.py for verify_token."
        ),
    ),
    ChallengeDefinition(
        id="challenge-trace-order",
        type="trace",
        title="Trace Order Processing Flow",
        prompt="When an order is submitted, what is the first validation check performed?",
        options=(
            "Inventory availability",
            "Payment authorization",
            "Token signature",
            "User quota",
        ),
        target_path="service/orders.py",
        target_symbol="create_order",
        hint="Look at the order creation handler in OrderManager.",
        correct_answer="Token signature",
        correct_feedback=(
            "Correct! In service/orders.py, create_order first calls verify_token to validate "
            "the authentication token signature before validating inventory or processing payment."
        ),
        incorrect_feedback=(
            "Incorrect. While '{answer}' may be checked during fulfillment, token signature "
            "verification occurs first to establish caller identity."
        ),
    ),
    ChallengeDefinition(
        id="challenge-predict-fee",
        type="predict",
        title="Predict Fee Calculation",
        prompt="What does calculate_fee return for an order amount of 100 with standard shipping?",
        options=("5.0", "0.0", "10.0", "15.0"),
        target_path="service/pricing.py",
        target_symbol="calculate_fee",
        hint="See the calculate_fee formula in pricing.py.",
        correct_answer="5.0",
        correct_feedback=(
            "Correct! calculate_fee calculates a 5% standard processing fee for orders of 100 "
            "with standard shipping (100 * 0.05 = 5.0)."
        ),
        incorrect_feedback=(
            "Incorrect. Based on calculate_fee in service/pricing.py, standard shipping on an "
            "order of 100 yields 5.0 (5% base fee)."
        ),
    ),
    ChallengeDefinition(
        id="challenge-locate-errors",
        type="locate",
        title="Locate Domain Exception Base",
        prompt="What is the base exception class used for custom domain errors in this service?",
        options=("ServiceError", "AppException", "BaseHandlerError", "DomainFault"),
        target_path="service/errors.py",
        target_symbol="ServiceError",
        hint="Check the error hierarchy in service/errors.py.",
        correct_answer="ServiceError",
        correct_feedback=(
            "Correct! ServiceError in service/errors.py serves as the root class for domain "
            "exceptions, holding a descriptive message and standardized error code."
        ),
        incorrect_feedback=(
            "Incorrect. Custom domain exceptions in this service inherit from ServiceError."
        ),
    ),
)

CHALLENGES_BY_ID: dict[str, ChallengeDefinition] = {c.id: c for c in ALL_CHALLENGES}
DYNAMIC_CHALLENGES: dict[str, ChallengeDefinition] = {}


def generate_locate_challenge_for_graph(graph: Any, repo_id: str) -> ChallengeDefinition:
    """Generate a dynamic Locate Challenge grounded in an imported repository graph."""
    symbols = getattr(graph, "symbols", [])
    files = getattr(graph, "files", [])

    candidates = [s for s in symbols if getattr(s, "kind", "") in ("function", "class", "method")]
    if not candidates:
        candidates = list(symbols)

    if not candidates:
        return ChallengeDefinition(
            id=f"challenge-locate-{repo_id}",
            type="locate",
            title=f"Locate Module Entrypoint in {repo_id}",
            prompt=f"Which file serves as the primary entrypoint for {repo_id}?",
            options=("main.py", "__init__.py", "app.py", "cli.py"),
            target_path="main.py",
            target_symbol="main",
            hint="Check the top-level repository files.",
            correct_answer="main.py",
            correct_feedback=f"Correct! main.py initializes repository {repo_id}.",
            incorrect_feedback="Incorrect. Check the repository root files.",
            repo_id=repo_id,
        )

    doc_candidates = [s for s in candidates if getattr(s, "docstring", None)]
    target = doc_candidates[0] if doc_candidates else candidates[0]

    target_file = next((f for f in files if f.id == target.file_id), None)
    target_path = target_file.path if target_file else "main.py"

    seen_names = {target.name}
    distinct_names = [target.name]
    for s in candidates:
        if s.name not in seen_names:
            distinct_names.append(s.name)
            seen_names.add(s.name)
            if len(distinct_names) == 4:
                break

    distractors = ["validate_request", "process_data", "configure_session", "format_output"]
    for d in distractors:
        if len(distinct_names) == 4:
            break
        if d not in seen_names:
            distinct_names.append(d)
            seen_names.add(d)

    options = tuple(sorted(distinct_names))

    doc = getattr(target, "docstring", "") or ""
    clean_doc = doc.strip().splitlines()[0].rstrip(".") if doc.strip() else ""

    if clean_doc and len(clean_doc) > 6:
        prompt = f'Which symbol in `{target_path}` is responsible for: "{clean_doc}"?'
    else:
        prompt = (
            f"Which symbol in `{target_path}` defines the {target.kind} implementing "
            f"`{target.name}`?"
        )

    start_line = target.range.start_line
    end_line = target.range.end_line
    hint = f"Inspect `{target_path}` around lines {start_line}–{end_line}."
    repo_name = getattr(graph.snapshot, "repository_name", repo_id) or repo_id

    challenge = ChallengeDefinition(
        id=f"challenge-locate-{repo_id}",
        type="locate",
        title=f"Locate {target.name} in {repo_name}",
        prompt=prompt,
        options=options,
        target_path=target_path,
        target_symbol=target.name,
        hint=hint,
        correct_answer=target.name,
        correct_feedback=(
            f"Correct! `{target.name}` in `{target_path}` (lines {start_line}–{end_line}) "
            "implements this functionality."
        ),
        incorrect_feedback=(
            f"Incorrect. '{{answer}}' is not the symbol defined at `{target_path}:{start_line}`. "
            f"The correct symbol is `{target.name}`."
        ),
        repo_id=repo_id,
    )
    DYNAMIC_CHALLENGES[challenge.id] = challenge
    return challenge


def list_challenges(repo_id: str | None = None) -> list[Challenge]:
    """Return challenges for the requested repository, dynamically generating if needed."""
    if not repo_id or repo_id in ("sample_service", "bundled"):
        return [c.to_public_challenge() for c in ALL_CHALLENGES]

    # Check cached dynamic challenge
    dyn_id = f"challenge-locate-{repo_id}"
    if dyn_id in DYNAMIC_CHALLENGES:
        return [DYNAMIC_CHALLENGES[dyn_id].to_public_challenge()]

    try:
        from app.codeintel.service import get_codebase_service

        svc = get_codebase_service()
        graph = svc.get_graph(repo_id)
        dyn_challenge = generate_locate_challenge_for_graph(graph, repo_id)
        return [dyn_challenge.to_public_challenge()]
    except Exception:
        # Fall back to sample service challenges if graph generation fails
        return [c.to_public_challenge() for c in ALL_CHALLENGES]


def get_challenge_by_id(
    challenge_id: str, repo_id: str | None = None
) -> ChallengeDefinition | None:
    """Retrieve challenge definition by ID across static and dynamic catalogs."""
    if challenge_id in CHALLENGES_BY_ID:
        return CHALLENGES_BY_ID[challenge_id]

    if challenge_id in DYNAMIC_CHALLENGES:
        return DYNAMIC_CHALLENGES[challenge_id]

    target_repo = repo_id
    if not target_repo and challenge_id.startswith("challenge-locate-"):
        target_repo = challenge_id.removeprefix("challenge-locate-")

    if target_repo and target_repo not in ("sample_service", "bundled"):
        try:
            from app.codeintel.service import get_codebase_service

            svc = get_codebase_service()
            graph = svc.get_graph(target_repo)
            return generate_locate_challenge_for_graph(graph, target_repo)
        except Exception:
            pass

    return None
