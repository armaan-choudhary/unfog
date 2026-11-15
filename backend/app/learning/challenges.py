"""Curated code-understanding challenges grounded in the sample service."""

from __future__ import annotations

from dataclasses import dataclass

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


def list_challenges() -> list[Challenge]:
    """Return all public challenges."""
    return [c.to_public_challenge() for c in ALL_CHALLENGES]


def get_challenge_by_id(challenge_id: str) -> ChallengeDefinition | None:
    """Retrieve challenge definition by ID."""
    return CHALLENGES_BY_ID.get(challenge_id)
