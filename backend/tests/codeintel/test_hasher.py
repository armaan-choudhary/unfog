"""Unit tests for cryptographic hasher utilities."""

from __future__ import annotations

import re

from app.codeintel.hasher import (
    compute_content_hash,
    compute_manifest_hash,
    compute_range_hash,
    extract_line_range_snippet,
)

SHA256_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")


def test_compute_content_hash_format_and_determinism() -> None:
    text = "def hello():\n    return 42\n"
    h1 = compute_content_hash(text)
    h2 = compute_content_hash(text)

    assert h1 == h2
    assert SHA256_PATTERN.match(h1)


def test_extract_line_range_snippet() -> None:
    content = "line1\nline2\nline3\nline4\n"
    snippet = extract_line_range_snippet(content, 2, 3)
    assert snippet == "line2\nline3\n"

    # Out of bounds clamping
    snippet_start = extract_line_range_snippet(content, 0, 2)
    assert snippet_start == "line1\nline2\n"

    snippet_end = extract_line_range_snippet(content, 3, 10)
    assert snippet_end == "line3\nline4\n"


def test_compute_range_hash() -> None:
    content = "line1\nline2\nline3\n"
    h_range = compute_range_hash(content, 1, 2)
    h_manual = compute_content_hash("line1\nline2\n")

    assert h_range == h_manual
    assert SHA256_PATTERN.match(h_range)


def test_compute_manifest_hash_order_invariance() -> None:
    records_1 = [("service/auth.py", "sha256:1111"), ("service/pricing.py", "sha256:2222")]
    records_2 = [("service/pricing.py", "sha256:2222"), ("service/auth.py", "sha256:1111")]

    h1 = compute_manifest_hash(records_1)
    h2 = compute_manifest_hash(records_2)

    assert h1 == h2
    assert SHA256_PATTERN.match(h1)
