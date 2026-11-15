"""Minimal authenticated, owner-scoped repository resource reads."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.ownership import get_owned_job, get_owned_repository, get_owned_snapshot
from app.core.auth import VerifiedIdentity, require_scopes, resolve_current_user
from app.db.models import Job, Repository, Snapshot
from app.db.session import get_db_session

router = APIRouter(tags=["repositories"])
READ_REPOSITORIES = require_scopes("repositories:read")
JobType = Literal[
    "repository_import",
    "snapshot_index",
    "analysis",
    "journey_generation",
    "challenge_generation",
    "snapshot_comparison",
]
JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
JobStage = Literal[
    "RECEIVED",
    "UNPACKING",
    "SCANNING",
    "PARSING",
    "RESOLVING",
    "GRAPH_READY",
    "AUTOPSY",
    "WORLD_READY",
    "COMPLETE",
]


class RepositoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    name: str
    source_kind: str
    default_branch: str | None
    privacy_mode: str
    created_at: datetime


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: UUID
    repository_id: UUID
    revision_kind: str
    revision_value: str
    manifest_hash: str
    status: str
    indexed_at: datetime | None
    parser_version: str | None
    created_at: datetime


class JobFailureResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=512)
    retryable: bool


class JobResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    job_id: UUID
    repository_id: UUID
    snapshot_id: UUID | None
    job_type: JobType
    status: JobStatus
    stage: JobStage
    progress: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    error: JobFailureResponse | None

    @classmethod
    def from_job(cls, job: Job) -> JobResponse:
        error = None
        if job.status == "failed":
            error = JobFailureResponse(
                code=job.error_code or "worker_execution_failed",
                message="The background job failed.",
                retryable=False,
            )
        return cls(
            job_id=job.id,
            repository_id=job.repository_id,
            snapshot_id=job.snapshot_id,
            job_type=cast(JobType, job.job_type),
            status=cast(JobStatus, job.status),
            stage=cast(JobStage, job.stage),
            progress=job.progress,
            created_at=job.created_at,
            updated_at=job.updated_at,
            completed_at=job.completed_at,
            error=error,
        )


@router.get("/repositories/{repository_id}", response_model=RepositoryResponse)
async def read_repository(
    repository_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(READ_REPOSITORIES)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Repository:
    user = resolve_current_user(session, identity)
    return get_owned_repository(session, user, repository_id)


@router.get(
    "/repositories/{repository_id}/snapshots/{snapshot_id}",
    response_model=SnapshotResponse,
)
async def read_snapshot(
    repository_id: UUID,
    snapshot_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(READ_REPOSITORIES)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Snapshot:
    user = resolve_current_user(session, identity)
    return get_owned_snapshot(session, user, repository_id, snapshot_id)


@router.get(
    "/repositories/{repository_id}/jobs/{job_id}",
    response_model=JobResponse,
)
async def read_job(
    repository_id: UUID,
    job_id: UUID,
    identity: Annotated[VerifiedIdentity, Depends(READ_REPOSITORIES)],
    session: Annotated[Session, Depends(get_db_session)],
) -> JobResponse:
    user = resolve_current_user(session, identity)
    return JobResponse.from_job(get_owned_job(session, user, repository_id, job_id))
