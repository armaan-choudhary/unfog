"""Centralized repository, snapshot, and job ownership queries."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApplicationError, ErrorCode
from app.db.models import Job, Repository, Snapshot, User


def _not_found() -> ApplicationError:
    return ApplicationError(
        ErrorCode.NOT_FOUND,
        "The requested resource was not found.",
        404,
    )


def get_owned_repository(session: Session, user: User, repository_id: UUID) -> Repository:
    repository = session.scalar(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.owner_id == user.id,
        )
    )
    if repository is None:
        raise _not_found()
    return repository


def get_owned_snapshot(
    session: Session, user: User, repository_id: UUID, snapshot_id: UUID
) -> Snapshot:
    snapshot = session.scalar(
        select(Snapshot)
        .join(Repository, Snapshot.repository_id == Repository.id)
        .where(
            Snapshot.id == snapshot_id,
            Snapshot.repository_id == repository_id,
            Repository.owner_id == user.id,
        )
    )
    if snapshot is None:
        raise _not_found()
    return snapshot


def get_owned_job(session: Session, user: User, repository_id: UUID, job_id: UUID) -> Job:
    job = session.scalar(
        select(Job)
        .join(Repository, Job.repository_id == Repository.id)
        .where(
            Job.id == job_id,
            Job.repository_id == repository_id,
            Repository.owner_id == user.id,
        )
    )
    if job is None:
        raise _not_found()
    return job
