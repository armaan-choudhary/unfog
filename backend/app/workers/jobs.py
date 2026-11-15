"""Internal job submission and PostgreSQL-backed state operations."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4

from kombu.exceptions import OperationalError as CeleryOperationalError
from sqlalchemy import Select, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.logging import JsonLogFormatter, RedactingFilter
from app.db.models import Job
from app.db.session import get_session_factory
from app.workers.celery_app import celery_app

logger = logging.getLogger("unfog.worker")
logger.setLevel(logging.INFO)
logger.propagate = False
if not any(handler.name == "unfog-worker-json" for handler in logger.handlers):
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    handler.name = "unfog-worker-json"
    logger.addHandler(handler)
if not any(isinstance(item, RedactingFilter) for item in logger.filters):
    logger.addFilter(RedactingFilter())


class TaskPublisher(Protocol):
    def send_task(
        self,
        name: str,
        *,
        args: list[str],
        task_id: str,
        headers: dict[str, str] | None = None,
    ) -> object: ...


class QueueUnavailableError(RuntimeError):
    """Raised when the persistent job could not be published to Redis."""


class InvalidJobTransition(ValueError):
    """Raised when a job state transition is not allowed."""


class RetryableJobFailure(RuntimeError):
    """Safe signal to Celery that the already-persisted job should be retried."""


def transition_job(job: Job, new_status: str) -> None:
    allowed = {
        "queued": {"running", "failed", "cancelled"},
        "running": {"queued", "succeeded", "failed", "cancelled"},
        "failed": {"queued"},
        "succeeded": set(),
        "cancelled": set(),
    }
    if new_status not in allowed.get(job.status, set()):
        raise InvalidJobTransition(f"Cannot transition a job from {job.status} to {new_status}.")
    job.status = new_status


def _publish(job_id: UUID, request_id: str | None, publisher: TaskPublisher) -> None:
    headers = {"request_id": request_id} if request_id else None
    publisher.send_task(
        "app.workers.tasks.echo_job",
        args=[str(job_id)],
        task_id=str(job_id),
        headers=headers,
    )


def submit_echo_job(
    repository_id: UUID,
    snapshot_id: UUID | None = None,
    *,
    request_id: str | None = None,
    job_id: UUID | None = None,
    session_factory: sessionmaker[Session] | None = None,
    publisher: TaskPublisher | None = None,
) -> UUID:
    """Persist one synthetic job, then publish it using the same UUID as task ID.

    Callers that retry submission should reuse ``job_id``. Worker retries never
    call this function and therefore cannot create additional persistent jobs.
    """
    identifier = job_id or uuid4()
    if identifier.version != 4:
        raise ValueError("Job IDs must be UUIDv4 values.")
    factory = session_factory or get_session_factory()
    task_publisher = publisher or celery_app

    with factory() as session:
        existing = session.get(Job, identifier)
        if existing is None:
            job = Job(
                id=identifier,
                repository_id=repository_id,
                snapshot_id=snapshot_id,
                job_type="analysis",
                status="queued",
                stage="RECEIVED",
                progress=0,
            )
            session.add(job)
            session.commit()
        else:
            if (
                existing.repository_id != repository_id
                or existing.snapshot_id != snapshot_id
                or existing.job_type != "analysis"
            ):
                raise ValueError("The job ID is already associated with a different submission.")
            if existing.status == "failed" and existing.error_code == "queue_unavailable":
                transition_job(existing, "queued")
                existing.error_code = None
                existing.error_message = None
                existing.completed_at = None
                session.commit()
            elif existing.status != "queued":
                return identifier

    try:
        _publish(identifier, request_id, task_publisher)
    except (CeleryOperationalError, OSError, ConnectionError) as exc:
        with factory() as session:
            failed_job = session.scalar(select(Job).where(Job.id == identifier).with_for_update())
            if failed_job is not None and failed_job.status == "queued":
                transition_job(failed_job, "failed")
                failed_job.error_code = "queue_unavailable"
                failed_job.error_message = "The background queue is temporarily unavailable."
                failed_job.completed_at = datetime.now(UTC)
                session.commit()
        logger.warning(
            "job_publish_failed",
            extra={
                "event": "job_publish_failed",
                "job_id": str(identifier),
                "request_id": request_id,
            },
        )
        raise QueueUnavailableError("The background queue is temporarily unavailable.") from exc

    logger.info(
        "job_submitted",
        extra={"event": "job_submitted", "job_id": str(identifier), "request_id": request_id},
    )
    return identifier


def list_stalled_jobs(
    *,
    older_than: timedelta = timedelta(minutes=15),
    now: datetime | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> list[UUID]:
    """Return stale job IDs for operator diagnostics without exposing job data."""
    cutoff = (now or datetime.now(UTC)) - older_than
    factory = session_factory or get_session_factory()
    statement: Select[UUID] = select(Job.id).where(
        Job.status.in_(("queued", "running")), Job.updated_at < cutoff
    )
    with factory() as session:
        return list(session.scalars(statement).all())


def requeue_stalled_job(
    job_id: UUID,
    *,
    older_than: timedelta = timedelta(minutes=15),
    now: datetime | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> bool:
    """Explicitly reset a stale running job for operator-triggered redelivery."""
    cutoff = (now or datetime.now(UTC)) - older_than
    factory = session_factory or get_session_factory()
    with factory() as session:
        job = session.scalar(
            select(Job)
            .where(Job.id == job_id, Job.status == "running", Job.updated_at < cutoff)
            .with_for_update()
        )
        if job is None:
            return False
        transition_job(job, "queued")
        job.error_code = None
        job.error_message = None
        job.completed_at = None
        session.commit()
    logger.warning(
        "stalled_job_requeued", extra={"event": "stalled_job_requeued", "job_id": str(job_id)}
    )
    return True


def lock_job(session: Session, job_id: UUID) -> Job | None:
    return session.scalar(select(Job).where(Job.id == job_id).with_for_update())
