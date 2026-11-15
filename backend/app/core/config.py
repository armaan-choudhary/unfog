"""Validated environment-based application settings."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Mapping

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class SettingsError(ValueError):
    """Raised when required application configuration is missing or invalid."""


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str = field(repr=False)
    app_env: Literal["development", "test", "production"] = "development"
    readiness_timeout_seconds: int = 3

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise SettingsError("DATABASE_URL is required.")
        try:
            database_url = make_url(self.database_url)
        except ArgumentError as exc:
            raise SettingsError("DATABASE_URL is not a valid database URL.") from exc
        if database_url.drivername not in {
            "postgresql",
            "postgresql+psycopg",
            "sqlite",
            "sqlite+pysqlite",
        }:
            raise SettingsError("DATABASE_URL uses an unsupported database driver.")
        if database_url.drivername.startswith("postgresql") and (
            not database_url.host or not database_url.database
        ):
            raise SettingsError("DATABASE_URL must include a PostgreSQL host and database.")
        if self.app_env not in {"development", "test", "production"}:
            raise SettingsError("APP_ENV must be development, test, or production.")
        if not 1 <= self.readiness_timeout_seconds <= 3:
            raise SettingsError("READINESS_TIMEOUT_SECONDS must be between 1 and 3.")

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> Settings:
        values = os.environ if environ is None else environ
        database_url = values.get("DATABASE_URL")
        if not database_url:
            raise SettingsError("DATABASE_URL is required.")

        app_env = values.get("APP_ENV", "development")
        if app_env not in {"development", "test", "production"}:
            raise SettingsError("APP_ENV must be development, test, or production.")

        raw_timeout = values.get("READINESS_TIMEOUT_SECONDS", "3")
        try:
            readiness_timeout_seconds = int(raw_timeout)
        except ValueError as exc:
            raise SettingsError(
                "READINESS_TIMEOUT_SECONDS must be an integer between 1 and 3."
            ) from exc

        return cls(
            database_url=database_url,
            app_env=app_env,  # type: ignore[arg-type]
            readiness_timeout_seconds=readiness_timeout_seconds,
        )
