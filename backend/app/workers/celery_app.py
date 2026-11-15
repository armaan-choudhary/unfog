"""Celery application factory and worker CLI entry point."""

from __future__ import annotations

from celery import Celery

from app.workers.config import WorkerSettings


def create_celery_app(settings: WorkerSettings | None = None) -> Celery:
    worker_settings = settings or WorkerSettings.from_environment()
    app = Celery("unfog", broker=worker_settings.redis_url, include=["app.workers.tasks"])
    app.conf.update(
        accept_content=["json"],
        task_serializer="json",
        result_serializer="json",
        task_ignore_result=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_track_started=True,
        task_soft_time_limit=worker_settings.task_soft_time_limit_seconds,
        task_time_limit=worker_settings.task_hard_time_limit_seconds,
        task_default_retry_delay=worker_settings.retry_base_delay_seconds,
        task_publish_retry=True,
        task_publish_retry_policy={
            "max_retries": 3,
            "interval_start": 0,
            "interval_step": 0.5,
            "interval_max": 2,
        },
        task_default_queue="unfog.jobs",
        worker_prefetch_multiplier=1,
        worker_cancel_long_running_tasks_on_connection_loss=True,
        broker_connection_retry_on_startup=True,
        broker_transport_options={"visibility_timeout": 3600},
        broker_url=worker_settings.redis_url,
        result_backend=None,
    )
    return app


celery_app = create_celery_app()
