"""FastAPI application factory and cross-cutting middleware."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator, Callable, Sequence
from contextlib import asynccontextmanager
from contextvars import ContextVar
from uuid import UUID, uuid4

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.ai import router as ai_router
from app.api.codeintel import router as codeintel_router
from app.api.health import check_database
from app.api.health import router as health_router
from app.api.learning import router as learning_router
from app.api.resources import router as resources_router
from app.core.auth import OIDCBearerVerifier, create_oidc_verifier
from app.core.config import Settings
from app.core.errors import (
    ApplicationError,
    ErrorCode,
    ErrorIssue,
    build_error_envelope,
)
from app.core.logging import configure_app_logging
from app.db.session import get_engine

REQUEST_ID_HEADER = "X-Request-ID"
request_id_context: ContextVar[str] = ContextVar("request_id", default="-")


def _request_id(value: str | None) -> UUID:
    if value:
        try:
            candidate = UUID(value)
            if candidate.version == 4 and str(candidate) == value:
                return candidate
        except ValueError:
            pass
    return uuid4()


def _error_response(
    *,
    status_code: int,
    code: ErrorCode,
    message: str,
    request_id: UUID | None = None,
    retryable: bool = False,
    issues: list[ErrorIssue] | None = None,
) -> JSONResponse:
    response = build_error_envelope(
        code=code,
        message=message,
        request_id=request_id or UUID(request_id_context.get()),
        retryable=retryable,
        issues=issues,
    )
    return JSONResponse(
        status_code=status_code,
        content=response.model_dump(mode="json", exclude_none=True),
        headers={"WWW-Authenticate": "Bearer"} if status_code == 401 else None,
    )


def _http_error(status_code: int) -> tuple[ErrorCode, str, bool]:
    mapped: dict[int, tuple[ErrorCode, str, bool]] = {
        401: (ErrorCode.UNAUTHENTICATED, "Authentication is required.", False),
        403: (ErrorCode.FORBIDDEN, "This request is not permitted.", False),
        404: (ErrorCode.NOT_FOUND, "The requested resource was not found.", False),
        409: (ErrorCode.CONFLICT, "The request conflicts with the current resource state.", False),
        429: (ErrorCode.RATE_LIMITED, "Too many requests.", True),
    }
    if status_code >= 500:
        return ErrorCode.INTERNAL_ERROR, "An unexpected error occurred.", True
    return mapped.get(
        status_code,
        (ErrorCode.INVALID_REQUEST, "The request could not be completed.", False),
    )


class RequestCorrelationMiddleware:
    """Pure ASGI request ID and structured access logging middleware."""

    def __init__(self, app: ASGIApp, logger: logging.Logger) -> None:
        self.app = app
        self.logger = logger

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        header_key = REQUEST_ID_HEADER.lower().encode("ascii")
        supplied_id = headers.get(header_key)
        request_id = _request_id(
            supplied_id.decode("ascii", errors="ignore") if supplied_id else None
        )
        request_id_string = str(request_id)
        scope.setdefault("state", {})["request_id"] = request_id_string
        context_token = request_id_context.set(request_id_string)
        started_at = time.monotonic()
        status_code = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal response_started, status_code
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                response_headers = list(message.get("headers", []))
                response_headers.append((header_key, request_id_string.encode("ascii")))
                message = {**message, "headers": response_headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            if response_started:
                raise
            status_code = 500
            self.logger.error(
                "request_failed",
                extra={
                    "event": "request_failed",
                    "request_id": request_id_string,
                    "http_method": scope.get("method", "unknown"),
                    "http_status": status_code,
                },
            )
            safe_response = _error_response(
                status_code=500,
                code=ErrorCode.INTERNAL_ERROR,
                message="An unexpected error occurred.",
                request_id=request_id,
                retryable=True,
            )
            await safe_response(scope, receive, send_with_request_id)
        finally:
            self.logger.info(
                "request_completed",
                extra={
                    "event": "request_completed",
                    "request_id": request_id_string,
                    "http_method": scope.get("method", "unknown"),
                    "http_status": status_code,
                    "duration_ms": round((time.monotonic() - started_at) * 1000, 2),
                },
            )
            request_id_context.reset(context_token)


def create_app(
    settings: Settings | None = None,
    *,
    readiness_probe: Callable[[], None] | None = None,
    routers: Sequence[APIRouter] = (),
    oidc_verifier: OIDCBearerVerifier | None = None,
) -> FastAPI:
    """Build an isolated FastAPI app, optionally with test-specific dependencies."""
    application_settings = settings or Settings.from_environment()
    app_logger = configure_app_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = get_engine(
            application_settings.database_url,
            connect_timeout_seconds=application_settings.readiness_timeout_seconds,
        )
        app.state.database_engine = engine
        app.state.readiness_probe = readiness_probe or (
            lambda: check_database(engine, application_settings.readiness_timeout_seconds)
        )
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(title="Unfog API", version="1.0.0", lifespan=lifespan)
    app.state.settings = application_settings
    app.state.oidc_verifier = oidc_verifier or create_oidc_verifier(application_settings)
    app.add_middleware(RequestCorrelationMiddleware, logger=app_logger)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(resources_router)
    app.include_router(codeintel_router)
    app.include_router(ai_router)
    app.include_router(learning_router)
    for router in routers:
        app.include_router(router)

    @app.exception_handler(ApplicationError)
    async def application_error_handler(request: Request, exc: ApplicationError) -> JSONResponse:
        return _error_response(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            request_id=request.state.request_id,
            retryable=exc.retryable,
            issues=exc.issues,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        issues = [
            ErrorIssue(
                code="validation_error",
                path=".".join(str(part) for part in error.get("loc", ()))[:256],
            )
            for error in exc.errors()
        ]
        return _error_response(
            status_code=422,
            code=ErrorCode.INVALID_REQUEST,
            message="Request validation failed.",
            request_id=request.state.request_id,
            issues=issues,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message, retryable = _http_error(exc.status_code)
        return _error_response(
            status_code=exc.status_code,
            code=code,
            message=message,
            request_id=request.state.request_id,
            retryable=retryable,
        )

    return app
