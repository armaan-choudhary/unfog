"""Celery task definitions and isolated per-delivery database work."""

from __future__ import annotations

import random
from datetime import UTC, datetime
from typing import Callable
from uuid import UUID

from billiard.exceptions import SoftTimeLimitExceeded
from celery import Task
from celery.signals import worker_shutdown
from sqlalchemy.orm import Session, sessionmaker

from app.db.session import get_session_factory
from app.workers.celery_app import celery_app
from app.workers.config import WorkerSettings
from app.workers.jobs import RetryableJobFailure, lock_job, logger, transition_job


def _echo_processor(_job_id: UUID) -> None:
    """Minimal bounded handler; later tickets replace it with real work."""


def execute_echo_job(
    job_id: UUID,
    *,
    session_factory: sessionmaker[Session] | None = None,
    processor: Callable[[UUID], None] = _echo_processor,
    settings: WorkerSettings | None = None,
    request_id: str | None = None,
) -> str:
    """Execute one delivery using a fresh SQLAlchemy session for each operation."""
    factory = session_factory or get_session_factory()
    worker_settings = settings or WorkerSettings.from_environment()

    with factory() as session:
        job = lock_job(session, job_id)
        if job is None:
            logger.warning(
                "job_record_missing", extra={"event": "job_record_missing", "job_id": str(job_id)}
            )
            return "missing"
        if job.status != "queued":
            return job.status
        transition_job(job, "running")
        retry_count = job.retry_count
        session.commit()

    try:
        processor(job_id)
    except SoftTimeLimitExceeded:
        return _record_failure(
            job_id,
            retry_count,
            factory,
            worker_settings,
            retryable=True,
            request_id=request_id,
        )
    except Exception:
        # Never log or persist exception text: it may include future repository data.
        return _record_failure(
            job_id,
            retry_count,
            factory,
            worker_settings,
            retryable=True,
            request_id=request_id,
        )

    with factory() as session:
        job = lock_job(session, job_id)
        if job is None:
            return "missing"
        if job.status != "running":
            return job.status
        transition_job(job, "succeeded")
        job.progress = 100
        job.stage = "COMPLETE"
        job.error_code = None
        job.error_message = None
        job.completed_at = datetime.now(UTC)
        session.commit()
    logger.info(
        "job_succeeded",
        extra={"event": "job_succeeded", "job_id": str(job_id), "request_id": request_id},
    )
    return "succeeded"


def _record_failure(
    job_id: UUID,
    retry_count: int,
    factory: sessionmaker[Session],
    settings: WorkerSettings,
    *,
    retryable: bool,
    request_id: str | None,
) -> str:
    with factory() as session:
        job = lock_job(session, job_id)
        if job is None:
            return "missing"
        if job.status != "running":
            return job.status
        if retryable and retry_count < settings.max_retries:
            transition_job(job, "queued")
            job.retry_count = retry_count + 1
            job.error_code = None
            job.error_message = None
            session.commit()
            logger.warning(
                "job_retry_scheduled",
                extra={
                    "event": "job_retry_scheduled",
                    "job_id": str(job_id),
                    "retry_count": retry_count + 1,
                    "request_id": request_id,
                },
            )
            raise RetryableJobFailure("The job failed and will be retried.") from None

        transition_job(job, "failed")
        job.error_code = "worker_execution_failed"
        job.error_message = "The background job could not be completed."
        job.completed_at = datetime.now(UTC)
        session.commit()
    logger.error(
        "job_failed",
        extra={
            "event": "job_failed",
            "job_id": str(job_id),
            "retry_count": retry_count,
            "request_id": request_id,
        },
    )
    return "failed"


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="app.workers.tasks.echo_job",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=10,
)
def echo_job(self: Task, job_id: str) -> str:
    """Run one persisted synthetic job; Celery does not store authoritative state."""
    identifier = UUID(job_id)
    settings = WorkerSettings.from_environment()
    headers = self.request.get("headers") or {}
    request_id = headers.get("request_id")
    try:
        return execute_echo_job(identifier, settings=settings, request_id=request_id)
    except RetryableJobFailure:
        retry_count = int(self.request.retries)
        delay = min(
            settings.retry_max_delay_seconds, settings.retry_base_delay_seconds * (2**retry_count)
        )
        delay = min(
            settings.retry_max_delay_seconds, max(1, round(delay * random.uniform(0.8, 1.2)))
        )
        raise self.retry(countdown=delay, max_retries=settings.max_retries) from None


@worker_shutdown.connect  # type: ignore[untyped-decorator]
def log_worker_shutdown(**_kwargs: object) -> None:
    logger.info("worker_shutdown", extra={"event": "worker_shutdown"})
