"""FastAPI router for Gemini AI explanation and chat endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.ai.schemas import (
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    ExplainResponse,
)
from app.ai.service import get_ai_service

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.post(
    "/explain",
    response_model=ExplainResponse,
    status_code=status.HTTP_200_OK,
    summary="Explain a symbol or code file with citations",
)
async def explain_code(request: ExplainRequest) -> ExplainResponse:
    """Generate a grounded explanation for a code symbol or file using Gemini AI."""
    service = get_ai_service()
    try:
        return service.explain(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Conversational code queries with citations",
)
async def chat_codebase(request: ChatRequest) -> ChatResponse:
    """Answer codebase questions using retrieved code context and Gemini AI."""
    service = get_ai_service()
    try:
        return service.chat(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
