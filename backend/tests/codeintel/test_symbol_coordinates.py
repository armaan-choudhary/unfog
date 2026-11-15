"""Regression tests for authoritative symbol coordinates across code intel, APIs, and AI citations.

Ensures graph nodes, inspector metadata, highlighted source lines, and citation
navigation all reference the exact same authoritative coordinates (e.g. verify_token
at lines 41-71 in service/auth.py).
"""

from __future__ import annotations

import ast
from typing import Any

from httpx2 import ASGITransport, AsyncClient, Response

from app.ai.context import retrieve_symbol_context
from app.api.codeintel import router as codeintel_router
from app.codeintel.scanner import build_source_graph
from app.codeintel.service import find_sample_service_dir
from app.core.config import Settings
from app.learning.evaluator import get_challenge_evaluator
from app.learning.schemas import EvaluateRequest
from app.main import create_app


def _settings() -> Settings:
    return Settings(database_url="sqlite+pysqlite:///:memory:", app_env="test")


def _request(app: Any, method: str, path: str, **kwargs: Any) -> Response:
    import asyncio

    async def run() -> Response:
        async with app.router.lifespan_context(app):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://testserver"
            ) as client:
                return await client.request(method, path, **kwargs)

    return asyncio.run(run())


def test_verify_token_source_file_and_ast_coordinates() -> None:
    sample_dir = find_sample_service_dir()
    auth_file = sample_dir / "service" / "auth.py"
    assert auth_file.is_file(), f"File {auth_file} not found"

    content = auth_file.read_text(encoding="utf-8")
    lines = content.splitlines()
    assert len(lines) == 71, f"Expected 71 lines in service/auth.py, got {len(lines)}"

    tree = ast.parse(content)
    verify_token_node: ast.FunctionDef | None = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "verify_token":
            verify_token_node = node
            break

    assert verify_token_node is not None, "verify_token function not found in AST"
    assert verify_token_node.lineno == 41, f"Expected start_line=41, got {verify_token_node.lineno}"
    assert verify_token_node.end_lineno == 71, (
        f"Expected end_lineno=71, got {verify_token_node.end_lineno}"
    )


def test_verify_token_coordinates_in_source_graph() -> None:
    sample_dir = find_sample_service_dir()
    graph = build_source_graph(sample_dir, repository_name="sample_service")

    sym = next((s for s in graph.symbols if s.name == "verify_token"), None)
    assert sym is not None, "verify_token symbol missing in SourceGraph"
    assert sym.range.start_line == 41, f"Expected start_line=41, got {sym.range.start_line}"
    assert sym.range.end_line == 71, f"Expected end_line=71, got {sym.range.end_line}"


def test_verify_token_coordinates_in_codebase_api_endpoints() -> None:
    app = create_app(_settings(), routers=[codeintel_router])

    # 1. /api/v1/codebase/graph
    graph_resp = _request(app, "GET", "/api/v1/codebase/graph")
    assert graph_resp.status_code == 200
    graph_data = graph_resp.json()

    verify_sym = next((s for s in graph_data["symbols"] if s["name"] == "verify_token"), None)
    assert verify_sym is not None, "verify_token missing in /api/v1/codebase/graph symbols"
    assert verify_sym["range"]["start_line"] == 41
    assert verify_sym["range"]["end_line"] == 71

    # 2. /api/v1/codebase/file?path=service/auth.py
    file_resp = _request(app, "GET", "/api/v1/codebase/file?path=service/auth.py")
    assert file_resp.status_code == 200
    file_data = file_resp.json()
    assert file_data["line_count"] == 71
    assert "def verify_token" in file_data["content"]

    file_verify_sym = next((s for s in file_data["symbols"] if s["name"] == "verify_token"), None)
    assert file_verify_sym is not None, "verify_token missing in file symbols"
    assert file_verify_sym["range"]["start_line"] == 41
    assert file_verify_sym["range"]["end_line"] == 71


def test_verify_token_context_retrieval_and_citation_coordinates() -> None:
    ctx = retrieve_symbol_context("service/auth.py", "verify_token")
    assert ctx.path == "service/auth.py"
    assert ctx.range.start_line == 41, f"Expected start_line=41, got {ctx.range.start_line}"
    assert ctx.range.end_line == 71, f"Expected end_line=71, got {ctx.range.end_line}"
    assert "def verify_token" in ctx.snippet

    citation = ctx.to_citation()
    assert citation.path == "service/auth.py"
    assert citation.range is not None
    assert citation.range.start_line == 41
    assert citation.range.end_line == 71


def test_verify_token_coordinates_in_challenge_evaluation() -> None:
    evaluator = get_challenge_evaluator()
    req = EvaluateRequest(answer="verify_token")
    res = evaluator.evaluate("challenge-locate-auth", req)

    assert res.is_correct is True
    assert len(res.citations) > 0
    auth_citation = next((c for c in res.citations if c.path == "service/auth.py"), None)
    assert auth_citation is not None, "Citation for service/auth.py missing in challenge evaluation"
    assert auth_citation.range is not None
    assert auth_citation.range.start_line == 41, (
        f"Expected citation start_line=41, got {auth_citation.range.start_line}"
    )
    assert auth_citation.range.end_line == 71, (
        f"Expected citation end_line=71, got {auth_citation.range.end_line}"
    )
