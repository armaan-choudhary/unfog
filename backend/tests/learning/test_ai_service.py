"""Tests for AI context retrieval, prompt generation, and Gemini service."""

from __future__ import annotations

import pytest

from app.ai.client import get_gemini_model_name, is_gemini_configured
from app.ai.context import (
    compute_sha256,
    extract_symbol_from_source,
    retrieve_relevant_citations_for_query,
    retrieve_symbol_context,
    validate_safe_path,
)
from app.ai.schemas import ChatMessage, ChatRequest, ExplainRequest
from app.ai.service import AIService


def test_validate_safe_path() -> None:
    assert validate_safe_path("service/auth.py") == "service/auth.py"
    assert validate_safe_path("nested/sub/file.py") == "nested/sub/file.py"

    with pytest.raises(ValueError, match="forbidden"):
        validate_safe_path("../secret.py")

    with pytest.raises(ValueError, match="forbidden"):
        validate_safe_path("service/../../etc/passwd")

    with pytest.raises(ValueError, match="forbidden"):
        validate_safe_path("/root/secret.py")

    with pytest.raises(ValueError, match="empty"):
        validate_safe_path("")


def test_compute_sha256() -> None:
    digest = compute_sha256("def test(): pass")
    assert digest.startswith("sha256:")
    assert len(digest) == 7 + 64


def test_extract_symbol_from_source() -> None:
    code = (
        "# Header\n"
        "def helper():\n"
        "    return 1\n\n"
        "def target_func(x: int) -> int:\n"
        '    """Docstring."""\n'
        "    return x + 1\n"
    )
    res = extract_symbol_from_source(code, "target_func")
    assert res is not None
    start, end, snippet = res
    assert start == 5
    assert end == 7
    assert "def target_func" in snippet


def test_retrieve_symbol_context_live_file() -> None:
    ctx = retrieve_symbol_context("service/auth.py", "verify_token")
    assert ctx.path == "service/auth.py"
    assert ctx.range.start_line >= 1
    assert ctx.range.end_line >= ctx.range.start_line
    assert "def verify_token" in ctx.snippet
    assert ctx.content_hash.startswith("sha256:")


def test_retrieve_symbol_context_fallback() -> None:
    ctx = retrieve_symbol_context("service/nonexistent_file.py", "some_func")
    assert ctx.path == "service/nonexistent_file.py"
    assert ctx.range.start_line >= 1
    assert ctx.range.end_line >= ctx.range.start_line
    assert ctx.content_hash.startswith("sha256:")


def test_retrieve_relevant_citations_for_query() -> None:
    citations_auth = retrieve_relevant_citations_for_query("How do we verify bearer tokens?")
    paths_auth = [c.path for c in citations_auth]
    assert "service/auth.py" in paths_auth

    citations_err = retrieve_relevant_citations_for_query("Where are service exceptions raised?")
    paths_err = [c.path for c in citations_err]
    assert "service/errors.py" in paths_err

    citations_active = retrieve_relevant_citations_for_query(
        "explain this code", active_path="service/pricing.py"
    )
    paths_active = [c.path for c in citations_active]
    assert "service/pricing.py" in paths_active


def test_ai_service_explain_offline_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    service = AIService()

    req = ExplainRequest(
        path="service/auth.py",
        symbol_name="verify_token",
        prompt="Explain token verification.",
    )
    resp = service.explain(req)

    assert resp.explanation
    assert "verify_token" in resp.explanation or "auth" in resp.explanation
    assert len(resp.citations) == 1
    assert resp.citations[0].path == "service/auth.py"
    assert resp.citations[0].range.start_line >= 1
    assert resp.provenance == "ai_inferred"
    assert resp.model


def test_ai_service_chat_offline_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    service = AIService()

    req = ChatRequest(
        message="Where are errors handled in this service?",
        history=[ChatMessage(role="user", content="Hello")],
    )
    resp = service.chat(req)

    assert resp.reply
    assert "service/errors.py" in resp.reply or "error" in resp.reply.lower()
    assert len(resp.citations) >= 1
    assert any(c.path == "service/errors.py" for c in resp.citations)


def test_ai_service_explain_with_gemini_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_generate(
        system_prompt: str, user_prompt: str, history: tuple[ChatMessage, ...] = ()
    ) -> tuple[str | None, str]:
        return "Simulated Gemini explanation of token verification.", "gemini-2.5-flash"

    monkeypatch.setattr("app.ai.service.call_gemini_generate", fake_generate)
    service = AIService()

    req = ExplainRequest(path="service/auth.py", symbol_name="verify_token")
    resp = service.explain(req)

    assert resp.explanation == "Simulated Gemini explanation of token verification."
    assert resp.model == "gemini-2.5-flash"
    assert len(resp.citations) == 1
    assert resp.citations[0].path == "service/auth.py"


def test_ai_service_chat_with_gemini_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_generate(
        system_prompt: str, user_prompt: str, history: tuple[ChatMessage, ...] = ()
    ) -> tuple[str | None, str]:
        return "Simulated Gemini chat reply.", "gemini-2.5-flash"

    monkeypatch.setattr("app.ai.service.call_gemini_generate", fake_generate)
    service = AIService()

    req = ChatRequest(message="What is the architecture?")
    resp = service.chat(req)

    assert resp.reply == "Simulated Gemini chat reply."
    assert resp.model == "gemini-2.5-flash"
    assert len(resp.citations) >= 1


def test_gemini_client_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert not is_gemini_configured()

    monkeypatch.setenv("GEMINI_API_KEY", "test-key-12345")
    assert is_gemini_configured()

    monkeypatch.setenv("GEMINI_MODEL", "gemini-custom-model")
    assert get_gemini_model_name() == "gemini-custom-model"
