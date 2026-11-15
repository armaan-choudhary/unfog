"""API endpoint integration tests for codebase and file inspection routes."""

from __future__ import annotations

import asyncio
from typing import Any

from httpx2 import ASGITransport, AsyncClient, Response

from app.api.codeintel import router as codeintel_router
from app.core.config import Settings
from app.main import create_app


def _settings() -> Settings:
    return Settings(database_url="sqlite+pysqlite:///:memory:", app_env="test")


def _request(app: Any, method: str, path: str, **kwargs: Any) -> Response:
    async def run() -> Response:
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                return await client.request(method, path, **kwargs)

    return asyncio.run(run())


def test_get_codebase_graph_endpoint() -> None:
    app = create_app(_settings(), routers=[codeintel_router])

    response = _request(app, "GET", "/api/v1/codebase/graph")
    assert response.status_code == 200

    data = response.json()
    assert data["schema_version"] == "1.0"
    assert data["snapshot"]["repository_name"] == "sample_service"
    assert len(data["files"]) > 0
    assert len(data["symbols"]) > 0
    assert len(data["citations"]) > 0
    assert len(data["edges"]) > 0

    # Ensure verify_token is present in symbols
    symbol_names = [s["name"] for s in data["symbols"]]
    assert "verify_token" in symbol_names
    assert "create_order" in symbol_names
    assert "calculate_fee" in symbol_names


def test_get_codebase_file_endpoint_success() -> None:
    app = create_app(_settings(), routers=[codeintel_router])

    response = _request(app, "GET", "/api/v1/codebase/file?path=service/auth.py")
    assert response.status_code == 200

    data = response.json()
    assert data["path"] == "service/auth.py"
    assert data["language"] == "python"
    assert data["line_count"] > 0
    assert "def verify_token" in data["content"]
    assert data["content_hash"].startswith("sha256:")

    symbols = data["symbols"]
    symbol_names = [s["name"] for s in symbols]
    assert "verify_token" in symbol_names
    assert "hash_password" in symbol_names


def test_get_codebase_file_not_found() -> None:
    app = create_app(_settings(), routers=[codeintel_router])

    response = _request(app, "GET", "/api/v1/codebase/file?path=service/missing.py")
    assert response.status_code == 404
    data = response.json()
    assert data["error"]["code"] == "not_found"


def test_get_codebase_file_path_traversal_forbidden() -> None:
    app = create_app(_settings(), routers=[codeintel_router])

    response = _request(app, "GET", "/api/v1/codebase/file?path=../../etc/passwd")
    # Path traversal rejected with 403
    assert response.status_code == 403
    data = response.json()
    assert data["error"]["code"] == "forbidden"


def test_get_codebase_file_missing_param() -> None:
    app = create_app(_settings(), routers=[codeintel_router])

    response = _request(app, "GET", "/api/v1/codebase/file")
    assert response.status_code == 422
