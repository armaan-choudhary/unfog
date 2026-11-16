"""Tests for AI context retrieval, prompt generation, and Gemini service."""

from __future__ import annotations

from pathlib import Path

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
    assert resp.model == "offline-fallback"


def test_ai_service_chat_offline_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    service = AIService()

    req = ChatRequest(
        message="Where are errors handled in this service?",
        history=[ChatMessage(role="user", content="Hello")],
    )
    resp = service.chat(req)

    assert resp.reply
    assert resp.model == "offline-fallback"
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


def test_multi_repo_context_retrieval(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    temp_dir = tmp_path / "test_repo"
    temp_dir.mkdir()
    pkg_dir = temp_dir / "mathlib"
    pkg_dir.mkdir()
    code_file = pkg_dir / "calculator.py"
    code_file.write_text(
        '"""Math calculations."""\n\n'
        "def add_numbers(a: int, b: int) -> int:\n"
        '    """Adds two numbers."""\n'
        "    return a + b\n",
        encoding="utf-8",
    )

    def fake_find_repo_root(repo_id: str | None = None):
        if repo_id == "custom_math_repo":
            return temp_dir
        from app.ai.context import find_sample_repo_root

        return find_sample_repo_root()

    monkeypatch.setattr("app.ai.context.find_repo_root", fake_find_repo_root)

    ctx = retrieve_symbol_context(
        "mathlib/calculator.py",
        "add_numbers",
        repo_id="custom_math_repo",
    )
    assert ctx.path == "mathlib/calculator.py"
    assert "add_numbers" in ctx.snippet
    assert ctx.range.start_line == 3
    assert ctx.range.end_line == 5

    # Nonexistent file in imported repo must fail, not invent fake code
    with pytest.raises(ValueError, match="not found in repository"):
        retrieve_symbol_context("nonexistent.py", repo_id="custom_math_repo")


def test_ai_service_multi_repo_explain_and_chat(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    temp_dir = tmp_path / "imported_repo"
    temp_dir.mkdir()
    service_file = temp_dir / "service.py"
    service_file.write_text("def process():\n    return True\n", encoding="utf-8")

    def fake_find_repo_root(repo_id: str | None = None):
        if repo_id == "repo_xyz":
            return temp_dir
        from app.ai.context import find_sample_repo_root

        return find_sample_repo_root()

    monkeypatch.setattr("app.ai.context.find_repo_root", fake_find_repo_root)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    service = AIService()

    # Explain
    exp_req = ExplainRequest(
        path="service.py",
        symbol_name="process",
        repo_id="repo_xyz",
    )
    exp_resp = service.explain(exp_req)
    assert exp_resp.model == "offline-fallback"
    assert "repo_xyz" in exp_resp.explanation
    assert exp_resp.citations[0].path == "service.py"

    # Chat
    chat_req = ChatRequest(
        message="How does process work?",
        active_path="service.py",
        repo_id="repo_xyz",
    )
    chat_resp = service.chat(chat_req)
    assert chat_resp.model == "offline-fallback"
    assert "repo_xyz" in chat_resp.reply


def test_js_ts_symbol_extraction() -> None:
    tsx_source = (
        "import React from 'react';\n"
        "\n"
        "interface Props {\n"
        "  name: string;\n"
        "}\n"
        "\n"
        "export function ProfileCard({ name }: Props) {\n"
        "  return (\n"
        '    <div className="card">\n'
        "      <h2>{name}</h2>\n"
        "    </div>\n"
        "  );\n"
        "}\n"
    )
    res = extract_symbol_from_source(
        tsx_source,
        "ProfileCard",
        file_path="components/ProfileCard.tsx",
    )
    assert res is not None
    start, end, snippet = res
    assert start == 7
    assert end == 13
    assert "ProfileCard" in snippet
    assert '<div className="card">' in snippet


def test_react_component_explain_offline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    temp_dir = tmp_path / "react_repo"
    temp_dir.mkdir()
    comp_file = temp_dir / "Button.tsx"
    comp_file.write_text(
        "export function Button({ label }: { label: string }) {\n"
        "  return <button>{label}</button>;\n"
        "}\n",
        encoding="utf-8",
    )

    def fake_find_repo_root(repo_id: str | None = None):
        if repo_id == "react_app":
            return temp_dir
        from app.ai.context import find_sample_repo_root

        return find_sample_repo_root()

    monkeypatch.setattr("app.ai.context.find_repo_root", fake_find_repo_root)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    service = AIService()
    req = ExplainRequest(
        path="Button.tsx",
        symbol_name="Button",
        repo_id="react_app",
    )
    resp = service.explain(req)
    assert resp.model == "offline-fallback"
    assert "Button.tsx" in resp.citations[0].path
    assert "frontend presentation" in resp.explanation or "react_app" in resp.explanation


def test_contextual_prompt_suggestions_generation() -> None:
    from app.ai.context import get_contextual_prompt_suggestions

    # 1. Component
    comp_suggs = get_contextual_prompt_suggestions(
        path="components/UserCard.tsx",
        symbol_name="UserCard",
        symbol_kind="component",
    )
    labels = [s["label"] for s in comp_suggs]
    assert any("component" in lbl.lower() for lbl in labels)
    assert any("rendered" in lbl.lower() for lbl in labels)
    assert any("dependencies" in lbl.lower() for lbl in labels)

    # 2. Function
    func_suggs = get_contextual_prompt_suggestions(
        path="service/auth.py",
        symbol_name="verify_token",
        symbol_kind="function",
    )
    func_labels = [s["label"] for s in func_suggs]
    assert any("verify_token" in lbl for lbl in func_labels)
    assert any("called" in lbl.lower() for lbl in func_labels)
    assert any("dependencies" in lbl.lower() for lbl in func_labels)

    # 3. Class
    class_suggs = get_contextual_prompt_suggestions(
        path="service/errors.py",
        symbol_name="ServiceError",
        symbol_kind="class",
    )
    class_labels = [s["label"] for s in class_suggs]
    assert any("class" in lbl.lower() for lbl in class_labels)
    assert any("used" in lbl.lower() for lbl in class_labels)

    # 4. Whole repo
    repo_suggs = get_contextual_prompt_suggestions()
    repo_labels = [s["label"] for s in repo_suggs]
    assert "Explain Architecture" in repo_labels
    assert "Trace execution flow" in repo_labels
    assert "Error handling" in repo_labels


def test_relationship_aware_citation_retrieval() -> None:
    # Query for callers of verify_token at active_path
    cits_caller = retrieve_relevant_citations_for_query(
        "Where is this called in the codebase?",
        active_path="service/auth.py",
        repo_id="sample_service",
    )
    assert len(cits_caller) >= 1
    assert any(c.path == "service/auth.py" for c in cits_caller)

    # Query for dependencies of orders
    cits_dep = retrieve_relevant_citations_for_query(
        "Explain dependencies of this module",
        active_path="service/orders.py",
        repo_id="sample_service",
    )
    assert len(cits_dep) >= 1
    assert any(c.path == "service/orders.py" for c in cits_dep)
