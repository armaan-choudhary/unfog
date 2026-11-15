"""Liveness and dependency-readiness endpoints."""

from collections.abc import Callable

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.engine import Engine

router = APIRouter(tags=["health"])


def check_database(engine: Engine, timeout_seconds: int = 3) -> None:
    """Perform a bounded database round-trip without returning driver details."""
    with engine.connect() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(
                text("SELECT set_config('statement_timeout', :timeout, true)"),
                {"timeout": f"{timeout_seconds * 1000}ms"},
            )
        connection.execute(text("SELECT 1"))


@router.get("/health", include_in_schema=True)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", include_in_schema=True)
async def ready(request: Request) -> dict[str, str]:
    try:
        readiness_probe: Callable[[], None] = request.app.state.readiness_probe
        readiness_probe()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="A required dependency is unavailable.",
        ) from exc
    return {"status": "ready"}
