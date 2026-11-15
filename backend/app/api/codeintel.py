"""API endpoints for codebase exploration, source graph, and file inspection."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.codeintel.models import FileDetailResponse, SourceGraph
from app.codeintel.service import CodebaseService, get_codebase_service

router = APIRouter(prefix="/api/v1/codebase", tags=["codebase"])


@router.get(
    "/graph",
    response_model=SourceGraph,
    summary="Get Codebase Source Graph",
    description="Returns the full source graph conforming to source-graph.v1.schema.json.",
)
async def get_source_graph(
    service: Annotated[CodebaseService, Depends(get_codebase_service)],
    repo_id: Annotated[
        str | None,
        Query(description="Repository identifier (defaults to active sample_service)"),
    ] = None,
) -> SourceGraph:
    """Returns the static verified source graph of the indexed repository."""
    return service.get_graph(repo_id=repo_id)


@router.get(
    "/file",
    response_model=FileDetailResponse,
    summary="Inspect Source File",
    description="Returns source code content, line count, and symbol list for a relative path.",
)
async def get_source_file(
    path: Annotated[
        str,
        Query(
            ...,
            description="Relative path of file within repository (e.g. service/auth.py)",
            min_length=1,
            max_length=1024,
        ),
    ],
    service: Annotated[CodebaseService, Depends(get_codebase_service)],
    repo_id: Annotated[
        str | None,
        Query(description="Repository identifier (defaults to active sample_service)"),
    ] = None,
) -> FileDetailResponse:
    """Returns file source content and symbol definitions."""
    return service.get_file(relative_path=path, repo_id=repo_id)
