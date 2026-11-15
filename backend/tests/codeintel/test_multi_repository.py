"""Tests for multi-repository indexing, state isolation, and API query filtering."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest
from httpx2 import ASGITransport, AsyncClient, Response

from app.api.codeintel import router as codeintel_router
from app.codeintel.service import CodebaseService, get_codebase_service
from app.core.config import Settings
from app.core.errors import ApplicationError
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


def test_multi_repository_registration_and_isolation(tmp_path: Path) -> None:
    # 1. Scaffold an arbitrary external repository with nested modules
    repo_dir = tmp_path / "custom_lib"
    pkg_dir = repo_dir / "custom_lib" / "nested"
    pkg_dir.mkdir(parents=True)

    (repo_dir / "__init__.py").write_text('"""Root init."""\n', encoding="utf-8")
    (repo_dir / "custom_lib" / "__init__.py").write_text('"""Pkg init."""\n', encoding="utf-8")

    math_py = pkg_dir / "calc.py"
    math_py.write_text(
        '''"""Calculation module."""

def add(a: int, b: int) -> int:
    """Adds two integers."""
    return a + b


class Calculator:
    """Class calculator."""

    def compute(self, x: int) -> int:
        """Computes double."""
        return add(x, x)
''',
        encoding="utf-8",
    )

    runner_py = repo_dir / "runner.py"
    runner_py.write_text(
        '''"""Runner module."""

from custom_lib.nested.calc import Calculator

calc_instance = Calculator()


def execute():
    """Executes computation."""
    return calc_instance.compute(5)
''',
        encoding="utf-8",
    )

    # Add a syntax-invalid file to verify robust graceful degradation
    bad_py = repo_dir / "broken.py"
    bad_py.write_text("def broken(:\n    pass\n", encoding="utf-8")

    # 2. Register with CodebaseService
    service = CodebaseService()
    graph = service.register_repository("custom_repo_1", repo_dir, "custom_lib")

    assert graph.snapshot.repository_name == "custom_lib"
    symbol_names = {s.name for s in graph.symbols}
    assert "add" in symbol_names
    assert "Calculator" in symbol_names
    assert "compute" in symbol_names
    assert "execute" in symbol_names

    # Verify broken file is indexed as SourceFile but does not crash graph
    broken_file = next((f for f in graph.files if f.path == "broken.py"), None)
    assert broken_file is not None

    # Verify call resolution: execute calls Calculator.compute
    calls_edges = [e for e in graph.edges if e.kind == "calls"]
    execute_sym = next(s for s in graph.symbols if s.name == "execute")
    compute_sym = next(s for s in graph.symbols if s.name == "compute")
    assert any(
        e.source_symbol_id == execute_sym.id and e.target_symbol_id == compute_sym.id
        for e in calls_edges
    )

    # 3. Path and isolation checks
    assert service.get_repo_path("custom_repo_1") == repo_dir.resolve()
    assert service.get_repo_path("sample_service") == service.default_root_dir.resolve()
    assert service.get_repo_path() == service.default_root_dir.resolve()

    # 4. Unknown repo raises 404
    with pytest.raises(ApplicationError) as exc_info:
        service.get_repo_path("unknown_repo")
    assert exc_info.value.status_code == 404

    # 5. File retrieval across repos
    file_detail = service.get_file("custom_lib/nested/calc.py", repo_id="custom_repo_1")
    assert file_detail.path == "custom_lib/nested/calc.py"
    assert "def add" in file_detail.content
    assert len(file_detail.symbols) == 3

    # Default file retrieval targets sample_service
    sample_auth = service.get_file("service/auth.py")
    assert sample_auth.path == "service/auth.py"
    assert "def verify_token" in sample_auth.content

    # 6. List repositories
    repos = service.list_repositories()
    repo_ids = {r["repo_id"] for r in repos}
    assert "sample_service" in repo_ids
    assert "custom_repo_1" in repo_ids


def test_api_multi_repository_endpoints(tmp_path: Path) -> None:
    repo_dir = tmp_path / "api_test_repo"
    repo_dir.mkdir(parents=True)
    (repo_dir / "app.py").write_text("def ping() -> str:\n    return 'pong'\n", encoding="utf-8")

    service = get_codebase_service()
    service.register_repository("api_repo_test", repo_dir, "api_test_repo")

    app = create_app(_settings(), routers=[codeintel_router])

    # Default graph (sample_service)
    res_default = _request(app, "GET", "/api/v1/codebase/graph")
    assert res_default.status_code == 200
    assert res_default.json()["snapshot"]["repository_name"] == "sample_service"

    # Custom repo graph
    res_custom = _request(app, "GET", "/api/v1/codebase/graph?repo_id=api_repo_test")
    assert res_custom.status_code == 200
    data_custom = res_custom.json()
    assert data_custom["snapshot"]["repository_name"] == "api_test_repo"
    assert any(s["name"] == "ping" for s in data_custom["symbols"])

    # Non-existent repo graph
    res_404 = _request(app, "GET", "/api/v1/codebase/graph?repo_id=ghost_repo")
    assert res_404.status_code == 404
    assert res_404.json()["error"]["code"] == "not_found"

    # Custom repo file
    res_file = _request(app, "GET", "/api/v1/codebase/file?path=app.py&repo_id=api_repo_test")
    assert res_file.status_code == 200
    assert "def ping" in res_file.json()["content"]

    # Traversal attack on custom repo
    res_traversal = _request(
        app, "GET", "/api/v1/codebase/file?path=../../etc/passwd&repo_id=api_repo_test"
    )
    assert res_traversal.status_code == 403
