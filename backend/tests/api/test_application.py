import asyncio
import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import APIRouter
from httpx2 import ASGITransport, AsyncClient, Response
from pydantic import BaseModel, Field
from sqlalchemy.engine import Engine

from app.core.config import Settings, SettingsError
from app.core.errors import ApplicationError, ErrorCode, ErrorEnvelope
from app.core.logging import JsonLogFormatter, RedactingFilter, redact_secrets
from app.main import REQUEST_ID_HEADER, create_app

ROOT = Path(__file__).resolve().parents[3]


def test_settings_require_database_url_and_validate_environment() -> None:
    with pytest.raises(SettingsError, match="DATABASE_URL is required"):
        Settings.from_environment({})

    with pytest.raises(SettingsError, match="APP_ENV"):
        Settings.from_environment({"DATABASE_URL": "sqlite://", "APP_ENV": "prod"})

    with pytest.raises(SettingsError, match="READINESS_TIMEOUT_SECONDS"):
        Settings.from_environment({"DATABASE_URL": "sqlite://", "READINESS_TIMEOUT_SECONDS": "99"})

    settings = Settings.from_environment(
        {
            "DATABASE_URL": "postgresql+psycopg://user:secret@localhost/db",
            "APP_ENV": "test",
            "READINESS_TIMEOUT_SECONDS": "2",
        }
    )
    assert settings.app_env == "test"
    assert "secret" not in repr(settings)


def _settings() -> Settings:
    return Settings(database_url="sqlite+pysqlite:///:memory:", app_env="test")


def _requests(app: Any, operations: list[tuple[str, str, dict[str, Any]]]) -> list[Response]:
    async def send_requests() -> list[Response]:
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                return [
                    await client.request(method, path, **kwargs)
                    for method, path, kwargs in operations
                ]

    return asyncio.run(send_requests())


def _request(app: Any, method: str, path: str, **kwargs: Any) -> Response:
    return _requests(app, [(method, path, kwargs)])[0]


def test_factory_registers_lifespan_and_health_routes() -> None:
    app = create_app(_settings(), readiness_probe=lambda: None)
    response, ready_response = _requests(app, [("GET", "/health", {}), ("GET", "/ready", {})])
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers[REQUEST_ID_HEADER]
    assert ready_response.json() == {"status": "ready"}


def test_health_is_live_when_database_dependency_is_unavailable() -> None:
    def unavailable() -> None:
        raise OSError("postgres://private-user:private-password@private-host/repo")

    app = create_app(_settings(), readiness_probe=unavailable)
    health_response, response = _requests(app, [("GET", "/health", {}), ("GET", "/ready", {})])
    assert health_response.status_code == 200
    assert response.status_code == 503
    assert ErrorEnvelope.model_validate(response.json()).error.code == ErrorCode.INTERNAL_ERROR
    assert "private-host" not in response.text
    assert "private-password" not in response.text


def _validation_router() -> APIRouter:
    router = APIRouter()

    class Payload(BaseModel):
        name: str = Field(min_length=2)

    @router.post("/_test/validation")
    async def validate_payload(payload: Payload) -> dict[str, str]:
        return {"name": payload.name}

    @router.get("/_test/application-error")
    async def application_error() -> None:
        raise ApplicationError(
            ErrorCode.EVIDENCE_UNAVAILABLE,
            "Evidence is unavailable for this snapshot.",
            409,
        )

    @router.get("/_test/unexpected-error")
    async def unexpected_error() -> None:
        raise RuntimeError("private repository contents and token=top-secret")

    return router


def test_validation_errors_follow_p0_04_contract_without_echoing_input() -> None:
    app = create_app(_settings(), routers=[_validation_router()])
    response = _request(
        app,
        "POST",
        "/_test/validation",
        json={"name": "x", "private_source": "do not echo this"},
    )

    assert response.status_code == 422
    envelope = response.json()
    parsed = ErrorEnvelope.model_validate(envelope)
    assert parsed.error.code == ErrorCode.INVALID_REQUEST
    assert parsed.error.message == "Request validation failed."
    assert parsed.error.issues
    assert "do not echo this" not in response.text
    assert "private_source" not in response.text


def test_application_and_unexpected_errors_are_safe_and_contract_shaped(
    capsys: pytest.CaptureFixture[str],
) -> None:
    app = create_app(_settings(), routers=[_validation_router()])
    supplied = str(uuid4())
    application_response, unexpected_response = _requests(
        app,
        [
            ("GET", "/_test/application-error", {}),
            (
                "GET",
                "/_test/unexpected-error",
                {"headers": {REQUEST_ID_HEADER: supplied}},
            ),
        ],
    )

    assert application_response.status_code == 409
    assert application_response.json()["error"]["code"] == "evidence_unavailable"
    assert unexpected_response.status_code == 500
    unexpected_envelope = ErrorEnvelope.model_validate(unexpected_response.json())
    assert unexpected_envelope.error.code == ErrorCode.INTERNAL_ERROR
    assert unexpected_envelope.error.request_id == UUID(supplied)
    assert unexpected_response.json()["error"]["message"] == "An unexpected error occurred."
    assert "private repository contents" not in unexpected_response.text
    assert "top-secret" not in unexpected_response.text
    logs = capsys.readouterr().err
    assert "private repository contents" not in logs
    assert "top-secret" not in logs


def test_error_fixture_validates_against_runtime_response_model() -> None:
    fixture = json.loads(
        (ROOT / "docs/contracts/examples/api-error.v1.example.json").read_text(encoding="utf-8")
    )
    parsed = ErrorEnvelope.model_validate(fixture)
    assert parsed.model_dump(mode="json", exclude_none=True) == fixture


def test_request_id_is_validated_propagated_and_replaced_when_invalid() -> None:
    app = create_app(_settings(), readiness_probe=lambda: None)
    supplied = str(uuid4())
    accepted, invalid = _requests(
        app,
        [
            ("GET", "/health", {"headers": {REQUEST_ID_HEADER: supplied}}),
            ("GET", "/health", {"headers": {REQUEST_ID_HEADER: "not-a-uuid"}}),
        ],
    )

    assert accepted.headers[REQUEST_ID_HEADER] == supplied
    invalid_id = UUID(invalid.headers[REQUEST_ID_HEADER])
    assert invalid_id.version == 4


def test_error_request_id_matches_correlation_header() -> None:
    app = create_app(_settings(), routers=[_validation_router()])
    supplied = str(uuid4())
    response = _request(
        app,
        "GET",
        "/_test/application-error",
        headers={REQUEST_ID_HEADER: supplied},
    )

    assert response.headers[REQUEST_ID_HEADER] == supplied
    assert response.json()["error"]["request_id"] == supplied


def test_secrets_are_redacted_and_structured_formatter_is_allow_listed() -> None:
    record = logging.LogRecord(
        "unfog.api",
        logging.INFO,
        __file__,
        1,
        "password=%s authorization=%s token=%s url=%s",
        (
            "hunter2",
            "Bearer bearer-secret",
            "api-token",
            "postgresql+psycopg://db-user:db-secret@db.example/db",
        ),
        None,
    )
    assert RedactingFilter().filter(record)
    message = record.getMessage()
    assert "hunter2" not in message
    assert "bearer-secret" not in message
    assert "api-token" not in message
    assert "db-secret" not in message

    record.request_id = str(uuid4())
    record.http_method = "GET"
    record.http_status = 200
    record.raw_source = "must not be serialized"
    serialized = JsonLogFormatter().format(record)
    payload: dict[str, Any] = json.loads(serialized)
    assert payload["request_id"] == record.request_id
    assert "raw_source" not in payload
    assert "must not be serialized" not in serialized


def test_redaction_covers_authorization_headers_and_database_urls() -> None:
    value = (
        "Authorization: Bearer secret-value "
        "authorization=Basic dXNlcjpwYXNzd29yZA== "
        "DATABASE_URL=postgresql+psycopg://u:p4ssword@host/database"
    )
    redacted = redact_secrets(value)
    assert "secret-value" not in redacted
    assert "dXNlcjpwYXNzd29yZA==" not in redacted
    assert "u:p4ssword" not in redacted
    assert "p4ssword" not in redacted


def test_lifespan_disposes_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    from unittest.mock import Mock

    engine = Mock(spec=Engine)
    monkeypatch.setattr("app.main.get_engine", lambda *args, **kwargs: engine)
    app = create_app(_settings())

    assert _request(app, "GET", "/health").status_code == 200

    engine.dispose.assert_called_once_with()
