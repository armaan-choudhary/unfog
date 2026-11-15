"""FastAPI router for GitHub repository import endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.github.schemas import (
    GitHubImportRequest,
    GitHubImportResponse,
    GitHubRepoInfo,
)
from app.github.service import GitHubService, get_github_service

router = APIRouter(prefix="/api/v1/github", tags=["github"])


@router.get(
    "/info",
    response_model=GitHubRepoInfo,
    status_code=status.HTTP_200_OK,
    summary="Get Public GitHub Repository Info",
    description="Fetches trusted repository metadata and primary language before analysis.",
)
async def get_repository_info(
    url: str,
    service: Annotated[GitHubService, Depends(get_github_service)],
) -> GitHubRepoInfo:
    """Get metadata and primary language for a public GitHub repository."""
    return service.get_repository_info(url)


@router.post(
    "/import",
    response_model=GitHubImportResponse,
    status_code=status.HTTP_200_OK,
    summary="Import Public GitHub Repository",
    description=(
        "Ingests a public GitHub repository by validating its URL, "
        "resolving the latest commit SHA, streaming and extracting "
        "Python source files securely, and indexing its source graph."
    ),
)
async def import_repository(
    request: GitHubImportRequest,
    service: Annotated[GitHubService, Depends(get_github_service)],
) -> GitHubImportResponse:
    """Import and index a public GitHub repository."""
    return service.import_repository(request.url)
