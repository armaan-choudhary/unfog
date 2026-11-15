"""Pydantic models for GitHub repository ingestion and import API."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GitHubImportRequest(BaseModel):
    """Payload for importing a public GitHub repository."""

    model_config = ConfigDict(frozen=True)

    url: str = Field(
        description="Public GitHub repository URL (e.g. https://github.com/owner/repo)"
    )


class RepositoryMetadata(BaseModel):
    """Metadata describing the imported GitHub repository."""

    model_config = ConfigDict(frozen=True)

    name: str = Field(description="Repository name")
    full_name: str = Field(description="Full repository name (owner/repo)")
    description: str | None = Field(default=None, description="Repository description")
    html_url: str = Field(description="GitHub repository web URL")
    default_branch: str = Field(description="Default branch name")
    visibility: str = Field(default="public", description="Repository visibility")
    language: str | None = Field(
        default=None, description="Primary repository language reported by GitHub"
    )
    stars: int = Field(default=0, description="Stargazers count")
    forks: int = Field(default=0, description="Forks count")
    open_issues: int = Field(default=0, description="Open issues count")


class GitHubRepoInfo(BaseModel):
    """Metadata and language info for a GitHub repository before import."""

    model_config = ConfigDict(frozen=True)

    owner: str = Field(description="Repository owner or organization")
    repo: str = Field(description="Repository name")
    full_name: str = Field(description="Full repository name (owner/repo)")
    description: str | None = Field(default=None, description="Repository description")
    html_url: str = Field(description="GitHub repository web URL")
    default_branch: str = Field(description="Default branch name")
    visibility: str = Field(default="public", description="Repository visibility")
    language: str | None = Field(
        default=None, description="Primary repository language reported by GitHub"
    )
    is_python: bool = Field(
        default=False, description="Whether primary repository language is Python"
    )
    stars: int = Field(default=0, description="Stargazers count")
    forks: int = Field(default=0, description="Forks count")


class GitHubImportResponse(BaseModel):
    """Response returned upon successful GitHub repository ingestion."""

    model_config = ConfigDict(frozen=True)

    repo_id: UUID = Field(description="Persistent UUID identifier for the imported repository")
    owner: str = Field(description="Repository owner or organization")
    repo: str = Field(description="Repository name")
    commit_sha: str = Field(description="Immutable git commit SHA ingested")
    default_branch: str = Field(description="Default branch name")
    file_count: int = Field(description="Number of Python files extracted into sandbox")
    metadata: RepositoryMetadata = Field(description="Repository metadata")
    extracted_path: str = Field(description="Path to sandbox directory on disk")
