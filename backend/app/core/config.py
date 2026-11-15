"""Validated environment-based application settings."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Mapping
from urllib.parse import urlparse

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class SettingsError(ValueError):
    """Raised when required application configuration is missing or invalid."""


OIDC_ALLOWED_ALGORITHMS = frozenset(
    {
        "RS256",
        "RS384",
        "RS512",
        "PS256",
        "PS384",
        "PS512",
        "ES256",
        "ES384",
        "ES512",
        "EdDSA",
    }
)


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str = field(repr=False)
    app_env: Literal["development", "test", "production"] = "development"
    readiness_timeout_seconds: int = 3
    oidc_issuer: str | None = None
    oidc_audience: str | None = None
    oidc_jwks_url: str | None = field(default=None, repr=False)
    oidc_allowed_algorithms: tuple[str, ...] = ("RS256",)
    oidc_jwks_timeout_seconds: int = 3
    dev_auth_enabled: bool = False
    dev_auth_token: str | None = field(default=None, repr=False)
    dev_auth_email: str | None = field(default=None, repr=False)
    dev_auth_subject: str = field(default="local-developer", repr=False)

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
        oidc_values = (self.oidc_issuer, self.oidc_audience, self.oidc_jwks_url)
        oidc_configured = any(value is not None for value in oidc_values)
        if oidc_configured and not all(value and value.strip() for value in oidc_values):
            raise SettingsError(
                "OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required together."
            )
        if self.dev_auth_enabled:
            if self.app_env != "development":
                raise SettingsError(
                    "Local development authentication is only allowed in development."
                )
            if oidc_configured:
                raise SettingsError(
                    "Configure either OIDC or local development authentication, not both."
                )
            if not self.dev_auth_token or len(self.dev_auth_token) < 32:
                raise SettingsError("UNFOG_DEV_AUTH_TOKEN must contain at least 32 characters.")
            if not self.dev_auth_email or len(self.dev_auth_email) > 320:
                raise SettingsError(
                    "UNFOG_DEV_AUTH_EMAIL is required for local development authentication."
                )
            if not self.dev_auth_subject.strip() or len(self.dev_auth_subject) > 255:
                raise SettingsError("UNFOG_DEV_AUTH_SUBJECT must contain 1 to 255 characters.")
        if self.app_env == "production" and not oidc_configured:
            raise SettingsError("OIDC configuration is required in production.")
        if not 1 <= self.oidc_jwks_timeout_seconds <= 5:
            raise SettingsError("OIDC_JWKS_TIMEOUT_SECONDS must be between 1 and 5.")
        if not self.oidc_allowed_algorithms or any(
            algorithm not in OIDC_ALLOWED_ALGORITHMS for algorithm in self.oidc_allowed_algorithms
        ):
            raise SettingsError("OIDC_ALLOWED_ALGORITHMS contains an unsupported algorithm.")
        if len(set(self.oidc_allowed_algorithms)) != len(self.oidc_allowed_algorithms):
            raise SettingsError("OIDC_ALLOWED_ALGORITHMS must not contain duplicates.")
        if oidc_configured:
            assert self.oidc_issuer is not None and self.oidc_jwks_url is not None
            if len(self.oidc_issuer) > 512 or len(self.oidc_audience or "") > 512:
                raise SettingsError("OIDC issuer and audience must not exceed 512 characters.")
            issuer = urlparse(self.oidc_issuer)
            jwks = urlparse(self.oidc_jwks_url)
            if not issuer.scheme or not issuer.netloc or issuer.username or issuer.password:
                raise SettingsError("OIDC_ISSUER must be an absolute URL without credentials.")
            if not jwks.scheme or not jwks.netloc or jwks.username or jwks.password:
                raise SettingsError("OIDC_JWKS_URL must be an absolute URL without credentials.")
            if issuer.query or issuer.fragment or jwks.query or jwks.fragment:
                raise SettingsError(
                    "OIDC issuer and JWKS URLs must not include query or fragment data."
                )
            if self.app_env == "production" and (
                issuer.scheme != "https" or jwks.scheme != "https"
            ):
                raise SettingsError("Production OIDC issuer and JWKS URLs must use HTTPS.")

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

        raw_jwks_timeout = values.get("OIDC_JWKS_TIMEOUT_SECONDS", "3")
        try:
            oidc_jwks_timeout_seconds = int(raw_jwks_timeout)
        except ValueError as exc:
            raise SettingsError(
                "OIDC_JWKS_TIMEOUT_SECONDS must be an integer between 1 and 5."
            ) from exc

        raw_dev_auth = values.get("UNFOG_DEV_AUTH_ENABLED", "false").strip().lower()
        if raw_dev_auth not in {"true", "false", "1", "0"}:
            raise SettingsError("UNFOG_DEV_AUTH_ENABLED must be true or false.")
        raw_algorithms = values.get("OIDC_ALLOWED_ALGORITHMS", "RS256")
        algorithms = tuple(part.strip() for part in raw_algorithms.split(",") if part.strip())

        return cls(
            database_url=database_url,
            app_env=app_env,  # type: ignore[arg-type]
            readiness_timeout_seconds=readiness_timeout_seconds,
            oidc_issuer=values.get("OIDC_ISSUER") or None,
            oidc_audience=values.get("OIDC_AUDIENCE") or None,
            oidc_jwks_url=values.get("OIDC_JWKS_URL") or None,
            oidc_allowed_algorithms=algorithms,
            oidc_jwks_timeout_seconds=oidc_jwks_timeout_seconds,
            dev_auth_enabled=raw_dev_auth in {"true", "1"},
            dev_auth_token=values.get("UNFOG_DEV_AUTH_TOKEN") or None,
            dev_auth_email=values.get("UNFOG_DEV_AUTH_EMAIL") or None,
            dev_auth_subject=values.get("UNFOG_DEV_AUTH_SUBJECT", "local-developer"),
        )
