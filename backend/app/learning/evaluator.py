"""Evaluation engine for learning challenges with verifiable citations."""

from __future__ import annotations

from app.ai.context import retrieve_symbol_context
from app.learning.challenges import get_challenge_by_id
from app.learning.schemas import EvaluateRequest, EvaluateResponse


class ChallengeEvaluator:
    """Evaluates student challenge submissions with pedagogical feedback and citations."""

    def evaluate(self, challenge_id: str, request: EvaluateRequest) -> EvaluateResponse:
        """Evaluate submission against challenge definition."""
        challenge = get_challenge_by_id(challenge_id)
        if not challenge:
            raise KeyError(f"Challenge '{challenge_id}' not found.")

        # Grounded citation for the challenge target
        ctx = retrieve_symbol_context(
            path=challenge.target_path,
            symbol_name=challenge.target_symbol,
        )
        citation = ctx.to_citation()

        cleaned_answer = request.answer.strip().lower()
        cleaned_target = challenge.correct_answer.strip().lower()

        is_correct = cleaned_answer == cleaned_target

        if is_correct:
            score = 100
            feedback = challenge.correct_feedback
        else:
            score = 0
            feedback = challenge.incorrect_feedback.format(answer=request.answer.strip())

        return EvaluateResponse(
            is_correct=is_correct,
            score=score,
            feedback=feedback,
            citations=[citation],
        )


_evaluator_instance: ChallengeEvaluator | None = None


def get_challenge_evaluator() -> ChallengeEvaluator:
    """Return shared ChallengeEvaluator singleton."""
    global _evaluator_instance
    if _evaluator_instance is None:
        _evaluator_instance = ChallengeEvaluator()
    return _evaluator_instance
