"""Tests for Learning Arena challenges, evaluator, and citation grounding."""

from __future__ import annotations

import pytest

from app.learning.challenges import list_challenges
from app.learning.evaluator import ChallengeEvaluator
from app.learning.schemas import EvaluateRequest


def test_list_challenges_returns_at_least_three_grounded_challenges() -> None:
    challenges = list_challenges()
    assert len(challenges) >= 3

    challenge_ids = {c.id for c in challenges}
    assert "challenge-locate-auth" in challenge_ids
    assert "challenge-trace-order" in challenge_ids
    assert "challenge-predict-fee" in challenge_ids

    types = {c.type for c in challenges}
    assert "locate" in types
    assert "trace" in types
    assert "predict" in types

    for ch in challenges:
        assert ch.id
        assert ch.title
        assert ch.prompt
        assert len(ch.options) >= 2
        assert ch.target_path
        assert ch.hint
        # Security & game integrity: correct answer must never be exposed
        assert not hasattr(ch, "correct_answer")


def test_evaluate_challenge_locate_auth_correct() -> None:
    evaluator = ChallengeEvaluator()
    req = EvaluateRequest(answer="verify_token")
    resp = evaluator.evaluate("challenge-locate-auth", req)

    assert resp.is_correct is True
    assert resp.score == 100
    assert "verify_token" in resp.feedback
    assert len(resp.citations) == 1
    citation = resp.citations[0]
    assert citation.path == "service/auth.py"
    assert citation.range.start_line >= 1
    assert citation.range.end_line >= citation.range.start_line
    assert "verify_token" in citation.snippet


def test_evaluate_challenge_locate_auth_incorrect() -> None:
    evaluator = ChallengeEvaluator()
    req = EvaluateRequest(answer="hash_password")
    resp = evaluator.evaluate("challenge-locate-auth", req)

    assert resp.is_correct is False
    assert resp.score == 0
    assert "Incorrect" in resp.feedback
    assert len(resp.citations) == 1
    assert resp.citations[0].path == "service/auth.py"


def test_evaluate_challenge_trace_order_correct() -> None:
    evaluator = ChallengeEvaluator()
    req = EvaluateRequest(answer="Token signature")
    resp = evaluator.evaluate("challenge-trace-order", req)

    assert resp.is_correct is True
    assert resp.score == 100
    assert len(resp.citations) == 1
    assert resp.citations[0].path == "service/orders.py"


def test_evaluate_challenge_predict_fee_correct() -> None:
    evaluator = ChallengeEvaluator()
    req = EvaluateRequest(answer="5.0")
    resp = evaluator.evaluate("challenge-predict-fee", req)

    assert resp.is_correct is True
    assert resp.score == 100
    assert len(resp.citations) == 1
    assert resp.citations[0].path == "service/pricing.py"


def test_evaluate_challenge_case_and_whitespace_insensitivity() -> None:
    evaluator = ChallengeEvaluator()
    req = EvaluateRequest(answer="   VERIFY_TOKEN   ")
    resp = evaluator.evaluate("challenge-locate-auth", req)

    assert resp.is_correct is True
    assert resp.score == 100


def test_evaluate_unknown_challenge_raises_key_error() -> None:
    evaluator = ChallengeEvaluator()
    req = EvaluateRequest(answer="anything")

    with pytest.raises(KeyError, match="not found"):
        evaluator.evaluate("nonexistent-challenge-id", req)


def test_dynamic_locate_challenge_generation(tmp_path: pytest.TempPathFactory) -> None:
    from uuid import uuid4

    from app.codeintel.models import (
        LineRange as IntelLineRange,
    )
    from app.codeintel.models import (
        SnapshotInfo,
        SnapshotRevision,
        SourceFile,
        SourceGraph,
        SourceSymbol,
    )
    from app.learning.challenges import generate_locate_challenge_for_graph

    snap_id = uuid4()
    file_id = uuid4()
    sym_id = uuid4()
    alt_sym_id = uuid4()

    graph = SourceGraph(
        schema_version="1.0",
        snapshot=SnapshotInfo(
            id=snap_id,
            repository_id=uuid4(),
            repository_name="sample_imported_repo",
            revision=SnapshotRevision(kind="git_commit", value="commit123"),
            manifest_hash="sha256:" + "a" * 64,
        ),
        files=[
            SourceFile(
                id=file_id,
                snapshot_id=snap_id,
                path="mypackage/core.py",
                language="python",
                content_hash="sha256:" + "b" * 64,
                line_count=50,
            )
        ],
        symbols=[
            SourceSymbol(
                id=sym_id,
                snapshot_id=snap_id,
                file_id=file_id,
                name="parse_expression",
                qualified_name="mypackage.core.parse_expression",
                kind="function",
                language="python",
                range=IntelLineRange(start_line=10, end_line=25),
                docstring="Parses expression tokens into an abstract syntax tree.",
            ),
            SourceSymbol(
                id=alt_sym_id,
                snapshot_id=snap_id,
                file_id=file_id,
                name="evaluate_expression",
                qualified_name="mypackage.core.evaluate_expression",
                kind="function",
                language="python",
                range=IntelLineRange(start_line=27, end_line=40),
            ),
        ],
        citations=[],
        edges=[],
    )

    challenge = generate_locate_challenge_for_graph(graph, "test-repo-42")
    assert challenge.id == "challenge-locate-test-repo-42"
    assert challenge.type == "locate"
    assert challenge.correct_answer == "parse_expression"
    assert "parse_expression" in challenge.options
    assert len(challenge.options) == 4
    assert challenge.target_path == "mypackage/core.py"
    assert "Parses expression tokens" in challenge.prompt
    assert "10" in challenge.hint

    pub = challenge.to_public_challenge()
    assert pub.id == challenge.id
    assert not hasattr(pub, "correct_answer")


def test_dynamic_locate_react_component_challenge() -> None:
    from uuid import uuid4

    from app.codeintel.models import (
        LineRange as IntelLineRange,
    )
    from app.codeintel.models import (
        SnapshotInfo,
        SnapshotRevision,
        SourceFile,
        SourceGraph,
        SourceSymbol,
    )
    from app.learning.challenges import generate_locate_challenge_for_graph

    snap_id = uuid4()
    file_id = uuid4()
    sym_id = uuid4()
    distract_id = uuid4()

    graph = SourceGraph(
        schema_version="1.0",
        snapshot=SnapshotInfo(
            id=snap_id,
            repository_id=uuid4(),
            repository_name="armaan-portfolio",
            revision=SnapshotRevision(kind="git_commit", value="commit999"),
            manifest_hash="sha256:" + "c" * 64,
        ),
        files=[
            SourceFile(
                id=file_id,
                snapshot_id=snap_id,
                path="components/Hero.tsx",
                language="typescript",
                content_hash="sha256:" + "d" * 64,
                line_count=45,
            )
        ],
        symbols=[
            SourceSymbol(
                id=sym_id,
                snapshot_id=snap_id,
                file_id=file_id,
                name="HeroSection",
                qualified_name="components.Hero.HeroSection",
                kind="component",
                language="typescript",
                range=IntelLineRange(start_line=8, end_line=30),
                docstring="Hero banner section component with animated intro.",
            ),
            SourceSymbol(
                id=distract_id,
                snapshot_id=snap_id,
                file_id=file_id,
                name="Navbar",
                qualified_name="components.Hero.Navbar",
                kind="component",
                language="typescript",
                range=IntelLineRange(start_line=32, end_line=44),
            ),
        ],
        citations=[],
        edges=[],
    )

    challenge = generate_locate_challenge_for_graph(graph, "armaan-portfolio")
    assert challenge.id == "challenge-locate-armaan-portfolio"
    assert challenge.type == "locate"
    assert "React Component" in challenge.title
    assert "Hero banner section component" in challenge.prompt or "HeroSection" in challenge.prompt
    assert "React component" in challenge.prompt
    assert challenge.correct_answer == "HeroSection"
    assert "HeroSection" in challenge.options
    assert len(challenge.options) == 4
    assert "React component `HeroSection`" in challenge.correct_feedback
