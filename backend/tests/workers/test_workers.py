from __future__ import annotations

import os
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4

from billiard.exceptions import SoftTimeLimitExceeded
from kombu.exceptions import OperationalError
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")

from app.db.base import Base
from app.db.models import Job, Repository, User
from app.workers import tasks
from app.workers.config import WorkerSettings, WorkerSettingsError
from app.workers.jobs import (
    InvalidJobTransition,
    QueueUnavailableError,
    list_stalled_jobs,
    requeue_stalled_job,
    submit_echo_job,
    transition_job,
)
from app.workers.tasks import RetryableJobFailure, execute_echo_job


class FakePublisher:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, str, str | None]] = []

    def send_task(
        self,
        name: str,
        *,
        args: list[str],
        task_id: str,
        headers: dict[str, str] | None = None,
    ) -> object:
        if self.error:
            raise self.error
        self.calls.append((name, task_id, (headers or {}).get("request_id")))
        return object()


class WorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "workers.db"
        self.engine = create_engine(f"sqlite+pysqlite:///{database_path}")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _record) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        with self.factory() as session:
            owner = User(email=f"{uuid4()}@example.test")
            session.add(owner)
            session.flush()
            repository = Repository(owner_id=owner.id, name="worker-test", source_kind="git")
            session.add(repository)
            session.commit()
            self.repository_id = repository.id

    def tearDown(self) -> None:
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _job(self, *, status: str = "queued", retry_count: int = 0) -> UUID:
        with self.factory() as session:
            job = Job(
                repository_id=self.repository_id,
                job_type="analysis",
                status=status,
                retry_count=retry_count,
            )
            session.add(job)
            session.commit()
            return job.id

    def _get_job(self, job_id: UUID) -> Job:
        with self.factory() as session:
            job = session.get(Job, job_id)
            assert job is not None
            session.expunge(job)
            return job

    def test_settings_validate_bounds_and_hide_redis_credentials(self) -> None:
        settings = WorkerSettings("redis://worker:private@localhost:6379/0")
        self.assertNotIn("private", repr(settings))
        with self.assertRaises(WorkerSettingsError):
            WorkerSettings("http://localhost:6379/0")
        with self.assertRaises(WorkerSettingsError):
            WorkerSettings("redis://localhost:6379/0", 300, 240)

    def test_submission_uses_same_uuid_and_reuses_record_on_retry(self) -> None:
        publisher = FakePublisher()
        job_id = uuid4()
        request_id = str(uuid4())
        for _ in range(2):
            result = submit_echo_job(
                self.repository_id,
                request_id=request_id,
                job_id=job_id,
                session_factory=self.factory,
                publisher=publisher,
            )
            self.assertEqual(result, job_id)
        self.assertEqual(len(publisher.calls), 2)
        self.assertTrue(all(call[1] == str(job_id) for call in publisher.calls))
        self.assertTrue(all(call[2] == request_id for call in publisher.calls))
        with self.factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(Job)), 1)

    def test_redis_publish_failure_marks_existing_job_failed_safely(self) -> None:
        with self.assertRaises(QueueUnavailableError):
            submit_echo_job(
                self.repository_id,
                session_factory=self.factory,
                publisher=FakePublisher(OperationalError("redis password=secret unavailable")),
            )
        with self.factory() as session:
            job = session.scalar(select(Job))
            assert job is not None
            self.assertEqual(job.status, "failed")
            self.assertEqual(job.error_code, "queue_unavailable")
            self.assertNotIn("secret", job.error_message or "")

    def test_queue_outage_can_recover_on_same_persistent_job_id(self) -> None:
        job_id = uuid4()
        with self.assertRaises(QueueUnavailableError):
            submit_echo_job(
                self.repository_id,
                job_id=job_id,
                session_factory=self.factory,
                publisher=FakePublisher(OperationalError("offline")),
            )
        publisher = FakePublisher()
        result = submit_echo_job(
            self.repository_id,
            job_id=job_id,
            session_factory=self.factory,
            publisher=publisher,
        )
        self.assertEqual(result, job_id)
        self.assertEqual(len(publisher.calls), 1)
        self.assertEqual(publisher.calls[0][1], str(job_id))
        self.assertEqual(self._get_job(job_id).status, "queued")

    def test_success_transitions_once_and_duplicate_delivery_is_idempotent(self) -> None:
        job_id = self._job()
        executions: list[UUID] = []

        def processor(identifier: UUID) -> None:
            executions.append(identifier)

        result = execute_echo_job(job_id, session_factory=self.factory, processor=processor)
        duplicate_result = execute_echo_job(
            job_id, session_factory=self.factory, processor=processor
        )
        job = self._get_job(job_id)
        self.assertEqual(result, "succeeded")
        self.assertEqual(duplicate_result, "succeeded")
        self.assertEqual(executions, [job_id])
        self.assertEqual((job.status, job.stage, job.progress), ("succeeded", "COMPLETE", 100))
        self.assertIsNotNone(job.completed_at)

    def test_failure_is_retried_on_same_job_then_recorded_safely(self) -> None:
        job_id = self._job()
        settings = WorkerSettings("redis://localhost/0", max_retries=1)

        def failure(_identifier: UUID) -> None:
            raise RuntimeError("raw repository content token=secret")

        with self.assertRaises(RetryableJobFailure):
            execute_echo_job(
                job_id, session_factory=self.factory, processor=failure, settings=settings
            )
        retrying_job = self._get_job(job_id)
        self.assertEqual((retrying_job.status, retrying_job.retry_count), ("queued", 1))
        self.assertEqual(
            execute_echo_job(
                job_id, session_factory=self.factory, processor=failure, settings=settings
            ),
            "failed",
        )
        failed_job = self._get_job(job_id)
        self.assertEqual(failed_job.error_code, "worker_execution_failed")
        self.assertNotIn("repository", failed_job.error_message or "")
        self.assertEqual(failed_job.retry_count, 1)

    def test_celery_retries_the_same_task_delivery(self) -> None:
        task_id = str(uuid4())
        with patch(
            "app.workers.tasks.execute_echo_job",
            side_effect=[RetryableJobFailure("safe"), "succeeded"],
        ) as execution:
            result = tasks.echo_job.apply(args=[task_id], throw=False)
        self.assertEqual(result.get(), "succeeded")
        self.assertEqual(execution.call_count, 2)
        self.assertEqual(execution.call_args_list[0].args[0], UUID(task_id))
        self.assertEqual(execution.call_args_list[1].args[0], UUID(task_id))

    def test_soft_timeout_is_retryable_and_final_failure_is_persisted(self) -> None:
        job_id = self._job()
        settings = WorkerSettings("redis://localhost/0", max_retries=0)
        result = execute_echo_job(
            job_id,
            session_factory=self.factory,
            processor=lambda _identifier: (_ for _ in ()).throw(SoftTimeLimitExceeded()),
            settings=settings,
        )
        self.assertEqual(result, "failed")
        self.assertEqual(self._get_job(job_id).error_code, "worker_execution_failed")

    def test_invalid_state_transition_is_rejected(self) -> None:
        job_id = self._job(status="succeeded")
        job = self._get_job(job_id)
        with self.assertRaises(InvalidJobTransition):
            transition_job(job, "running")

    def test_factory_creates_isolated_sessions(self) -> None:
        first = self.factory()
        second = self.factory()
        try:
            self.assertIsNot(first, second)
            self.assertIsNot(first.identity_map, second.identity_map)
        finally:
            first.close()
            second.close()

    def test_stalled_diagnostics_return_only_old_queued_or_running_ids(self) -> None:
        stale_id = self._job(status="running")
        recent_id = self._job(status="queued")
        cutoff_time = datetime.now(UTC)
        with self.factory() as session:
            session.get(Job, stale_id).updated_at = cutoff_time - timedelta(hours=1)  # type: ignore[union-attr]
            session.get(Job, recent_id).updated_at = cutoff_time  # type: ignore[union-attr]
            session.commit()
        stalled = list_stalled_jobs(
            older_than=timedelta(minutes=10), now=cutoff_time, session_factory=self.factory
        )
        self.assertEqual(stalled, [stale_id])
        self.assertTrue(
            requeue_stalled_job(
                stale_id,
                older_than=timedelta(minutes=10),
                now=cutoff_time,
                session_factory=self.factory,
            )
        )
        self.assertEqual(self._get_job(stale_id).status, "queued")


if __name__ == "__main__":
    unittest.main()
