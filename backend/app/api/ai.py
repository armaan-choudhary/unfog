"""FastAPI router for Gemini AI explanation and chat endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.ai.context import get_contextual_prompt_suggestions
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


@router.get(
    "/suggestions",
    response_model=list[dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Get contextual prompt suggestions based on selected symbol and relationships",
)
async def get_prompt_suggestions(
    path: str | None = Query(default=None, description="Optional relative file path"),
    symbol_name: str | None = Query(default=None, description="Optional symbol name"),
    symbol_kind: str | None = Query(default=None, description="Optional symbol kind"),
    repo_id: str | None = Query(default=None, description="Optional repository identifier"),
) -> list[dict[str, str]]:
    """Return smart contextual prompt suggestions based on active symbol and relationships."""
    return get_contextual_prompt_suggestions(
        path=path,
        symbol_name=symbol_name,
        symbol_kind=symbol_kind,
        repo_id=repo_id,
    )
