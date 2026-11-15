from __future__ import annotations

import os
import time
import unittest
from uuid import uuid4

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")

from alembic.config import Config
from celery.contrib.testing.worker import start_worker
from sqlalchemy import select

from alembic import command
from app.db.models import Job, Repository, User
from app.db.session import get_session_factory
from app.workers import tasks as _registered_tasks  # noqa: F401
from app.workers.celery_app import celery_app
from app.workers.jobs import submit_echo_job

DATABASE_URL = os.environ.get("UNFOG_TEST_POSTGRES_URL")
REDIS_URL = os.environ.get("UNFOG_TEST_REDIS_URL")
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


@unittest.skipUnless(
    DATABASE_URL and REDIS_URL, "requires disposable PostgreSQL and Redis services"
)
class LiveRedisWorkerTests(unittest.TestCase):
    def test_job_is_delivered_by_redis_worker_and_persisted_in_postgres(self) -> None:
        assert DATABASE_URL is not None
        assert REDIS_URL is not None
        os.environ["DATABASE_URL"] = DATABASE_URL
        os.environ["REDIS_URL"] = REDIS_URL
        get_session_factory.cache_clear()
        config = Config(os.path.join(BACKEND, "alembic.ini"))
        command.upgrade(config, "head")
        celery_app.conf.update(broker_url=REDIS_URL, broker_connection_retry_on_startup=True)
        factory = get_session_factory(DATABASE_URL)

        with factory() as session:
            owner = User(email=f"{uuid4()}@example.test")
            session.add(owner)
            session.flush()
            repository = Repository(owner_id=owner.id, name="worker-live", source_kind="git")
            session.add(repository)
            session.commit()
            repository_id = repository.id

        with start_worker(celery_app, pool="solo", concurrency=1, perform_ping_check=False):
            job_id = submit_echo_job(repository_id, session_factory=factory)
            deadline = time.monotonic() + 15
            status = "queued"
            while time.monotonic() < deadline:
                with factory() as session:
                    job = session.scalar(select(Job).where(Job.id == job_id))
                    assert job is not None
                    status = job.status
                if status in {"succeeded", "failed"}:
                    break
                time.sleep(0.1)

        self.assertEqual(status, "succeeded")
        with factory() as session:
            job = session.get(Job, job_id)
            assert job is not None
            self.assertEqual((job.status, job.progress, job.stage), ("succeeded", 100, "COMPLETE"))


if __name__ == "__main__":
    unittest.main()
