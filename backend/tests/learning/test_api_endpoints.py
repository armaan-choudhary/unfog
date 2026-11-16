"""Integration tests for AI and Learning Arena API endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from app.api.ai import router as ai_router
from app.api.learning import router as learning_router


@pytest.fixture
def client() -> TestClient:
    app = FastAPI(title="Test Unfog App")
    app.include_router(ai_router)
    app.include_router(learning_router)
    return TestClient(app)


def test_ai_explain_endpoint_success(client: TestClient) -> None:
    payload = {
        "path": "service/auth.py",
        "symbol_name": "verify_token",
        "prompt": "How does token verification work?",
    }
    response = client.post("/api/v1/ai/explain", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "explanation" in data
    assert len(data["explanation"]) > 0
    assert "citations" in data
    assert len(data["citations"]) >= 1

    citation = data["citations"][0]
    assert citation["path"] == "service/auth.py"
    assert "start_line" in citation["range"]
    assert "end_line" in citation["range"]
    assert citation["range"]["start_line"] >= 1
    assert "snippet" in citation
    assert "model" in data
    assert data["provenance"] == "ai_inferred"


def test_ai_explain_path_traversal_blocked(client: TestClient) -> None:
    payload = {
        "path": "../../../etc/passwd",
        "symbol_name": "root",
    }
    response = client.post("/api/v1/ai/explain", json=payload)
    assert response.status_code == 400
    assert "forbidden" in response.json()["detail"]


def test_ai_chat_endpoint_success(client: TestClient) -> None:
    payload = {
        "message": "Where are errors handled in this service?",
        "history": [],
    }
    response = client.post("/api/v1/ai/chat", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "reply" in data
    assert len(data["reply"]) > 0
    assert "citations" in data
    assert len(data["citations"]) >= 1
    assert "model" in data


def test_ai_suggestions_endpoint(client: TestClient) -> None:
    # 1. Without params (repo-level suggestions)
    resp = client.get("/api/v1/ai/suggestions")
    assert resp.status_code == 200
    suggs = resp.json()
    assert isinstance(suggs, list)
    assert len(suggs) >= 3
    assert any(s["label"] == "Explain Architecture" for s in suggs)

    # 2. With symbol params
    resp_sym = client.get(
        "/api/v1/ai/suggestions?path=service/auth.py&symbol_name=verify_token&symbol_kind=function"
    )
    assert resp_sym.status_code == 200
    sym_suggs = resp_sym.json()
    assert any("verify_token" in s["label"] for s in sym_suggs)
    assert any("called" in s["label"].lower() for s in sym_suggs)


def test_learning_challenges_list(client: TestClient) -> None:
    response = client.get("/api/v1/learning/challenges")
    assert response.status_code == 200

    challenges = response.json()
    assert isinstance(challenges, list)
    assert len(challenges) >= 3

    ids = [c["id"] for c in challenges]
    assert "challenge-locate-auth" in ids
    assert "challenge-trace-order" in ids
    assert "challenge-predict-fee" in ids

    for ch in challenges:
        assert "id" in ch
        assert "type" in ch
        assert "title" in ch
        assert "prompt" in ch
        assert "options" in ch
        assert "target_path" in ch
        assert "hint" in ch


def test_learning_evaluate_correct(client: TestClient) -> None:
    payload = {
        "answer": "verify_token",
        "selected_path": "service/auth.py",
    }
    response = client.post(
        "/api/v1/learning/challenges/challenge-locate-auth/evaluate",
        json=payload,
    )
    assert response.status_code == 200

    data = response.json()
    assert data["is_correct"] is True
    assert data["score"] == 100
    assert "feedback" in data
    assert "verify_token" in data["feedback"]
    assert len(data["citations"]) == 1
    assert data["citations"][0]["path"] == "service/auth.py"


def test_learning_evaluate_incorrect(client: TestClient) -> None:
    payload = {
        "answer": "hash_password",
        "selected_path": "service/auth.py",
    }
    response = client.post(
        "/api/v1/learning/challenges/challenge-locate-auth/evaluate",
        json=payload,
    )
    assert response.status_code == 200

    data = response.json()
    assert data["is_correct"] is False
    assert data["score"] == 0
    assert "Incorrect" in data["feedback"]
    assert len(data["citations"]) == 1


def test_learning_evaluate_not_found(client: TestClient) -> None:
    payload = {"answer": "anything"}
    response = client.post(
        "/api/v1/learning/challenges/unknown-id/evaluate",
        json=payload,
    )
    assert response.status_code == 404


def test_api_endpoints_with_repo_id(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temp_dir = tmp_path / "sample_imported_repo"
    temp_dir.mkdir()
    service_file = temp_dir / "app.py"
    service_file.write_text("def start():\n    return 'started'\n", encoding="utf-8")

    def fake_find_repo_root(repo_id: str | None = None):
        if repo_id == "my_test_repo":
            return temp_dir
        from app.ai.context import find_sample_repo_root

        return find_sample_repo_root()

    monkeypatch.setattr("app.ai.context.find_repo_root", fake_find_repo_root)

    # 1. AI Explain with repo_id
    explain_payload = {
        "path": "app.py",
        "symbol_name": "start",
        "repo_id": "my_test_repo",
    }
    resp = client.post("/api/v1/ai/explain", json=explain_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["model"] == "offline-fallback"
    assert data["citations"][0]["path"] == "app.py"

    # 2. AI Chat with repo_id
    chat_payload = {
        "message": "how does app start?",
        "active_path": "app.py",
        "repo_id": "my_test_repo",
    }
    resp_chat = client.post("/api/v1/ai/chat", json=chat_payload)
    assert resp_chat.status_code == 200
    assert resp_chat.json()["model"] == "offline-fallback"

    # 3. Learning challenges query with repo_id
    resp_ch = client.get("/api/v1/learning/challenges?repo_id=sample_service")
    assert resp_ch.status_code == 200
    assert len(resp_ch.json()) >= 3
