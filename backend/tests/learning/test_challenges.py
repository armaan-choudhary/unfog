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
