"""Typed Celery worker settings, loaded from the process environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping
from urllib.parse import urlsplit


class WorkerSettingsError(ValueError):
    """Raised when worker configuration is missing or invalid."""


@dataclass(frozen=True, slots=True)
class WorkerSettings:
    redis_url: str = field(repr=False)
    task_soft_time_limit_seconds: int = 240
    task_hard_time_limit_seconds: int = 300
    max_retries: int = 3
    retry_base_delay_seconds: int = 2
    retry_max_delay_seconds: int = 60

    def __post_init__(self) -> None:
        parsed = urlsplit(self.redis_url)
        if parsed.scheme not in {"redis", "rediss"} or not parsed.hostname:
            raise WorkerSettingsError("REDIS_URL must be a valid Redis URL.")
        if not 1 <= self.task_soft_time_limit_seconds < self.task_hard_time_limit_seconds <= 3600:
            raise WorkerSettingsError("Worker task time limits must be ordered and at most 3600.")
        if not 0 <= self.max_retries <= 10:
            raise WorkerSettingsError("WORKER_MAX_RETRIES must be between 0 and 10.")
        if not 1 <= self.retry_base_delay_seconds <= self.retry_max_delay_seconds <= 300:
            raise WorkerSettingsError("Worker retry delays must be ordered and at most 300.")

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> WorkerSettings:
        values = os.environ if environ is None else environ

        def integer(name: str, default: int) -> int:
            raw = values.get(name, str(default))
            try:
                return int(raw)
            except ValueError as exc:
                raise WorkerSettingsError(f"{name} must be an integer.") from exc

        redis_url = values.get("REDIS_URL")
        if not redis_url:
            raise WorkerSettingsError("REDIS_URL is required to start the worker.")

        return cls(
            redis_url=redis_url,
            task_soft_time_limit_seconds=integer("WORKER_TASK_SOFT_TIME_LIMIT_SECONDS", 240),
            task_hard_time_limit_seconds=integer("WORKER_TASK_HARD_TIME_LIMIT_SECONDS", 300),
            max_retries=integer("WORKER_MAX_RETRIES", 3),
            retry_base_delay_seconds=integer("WORKER_RETRY_BASE_DELAY_SECONDS", 2),
            retry_max_delay_seconds=integer("WORKER_RETRY_MAX_DELAY_SECONDS", 60),
        )
