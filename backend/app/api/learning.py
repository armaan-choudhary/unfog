"""FastAPI router for Learning Arena challenges and evaluation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.learning.challenges import list_challenges
from app.learning.evaluator import get_challenge_evaluator
from app.learning.schemas import Challenge, EvaluateRequest, EvaluateResponse

router = APIRouter(prefix="/api/v1/learning", tags=["learning"])


@router.get(
    "/challenges",
    response_model=list[Challenge],
    status_code=status.HTTP_200_OK,
    summary="List available learning challenges",
)
async def get_challenges() -> list[Challenge]:
    """Retrieve all active code understanding challenges grounded in the sample service."""
    return list_challenges()


@router.post(
    "/challenges/{challenge_id}/evaluate",
    response_model=EvaluateResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate a challenge submission",
)
async def evaluate_challenge(
    challenge_id: str,
    request: EvaluateRequest,
) -> EvaluateResponse:
    """Evaluate a user answer against a challenge and return score, feedback, and citations."""
    evaluator = get_challenge_evaluator()
    try:
        return evaluator.evaluate(challenge_id, request)
    except KeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
