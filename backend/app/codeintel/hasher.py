"""Cryptographic hashing utilities for content, line range citations, and snapshots."""

from __future__ import annotations

import hashlib
from collections.abc import Sequence


def compute_content_hash(content: str | bytes) -> str:
    """Computes a canonical SHA-256 hash formatted as 'sha256:<hex>'."""
    raw = content.encode("utf-8") if isinstance(content, str) else content
    digest = hashlib.sha256(raw).hexdigest()
    return f"sha256:{digest}"


def extract_line_range_snippet(content: str, start_line: int, end_line: int) -> str:
    """Extracts lines start_line to end_line (1-indexed, inclusive) from text."""
    lines = content.splitlines(keepends=True)
    if not lines:
        return ""
    start_idx = max(0, start_line - 1)
    end_idx = min(len(lines), end_line)
    return "".join(lines[start_idx:end_idx])


def compute_range_hash(content: str, start_line: int, end_line: int) -> str:
    """Computes SHA-256 hash for the given line range inside content."""
    snippet = extract_line_range_snippet(content, start_line, end_line)
    return compute_content_hash(snippet)


def compute_manifest_hash(file_records: Sequence[tuple[str, str]]) -> str:
    """Computes deterministic manifest hash across sorted (path, content_hash) pairs."""
    sorted_records = sorted(file_records, key=lambda pair: pair[0])
    manifest_payload = "\n".join(f"{path}:{content_hash}" for path, content_hash in sorted_records)
    return compute_content_hash(manifest_payload)
