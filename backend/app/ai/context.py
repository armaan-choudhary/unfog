"""Context retrieval and grounded code citation engine."""

from __future__ import annotations

import ast
import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path

from app.ai.schemas import CodeCitation, LineRange

SAFE_PATH_PATTERN = re.compile(r"^(?!/)(?!.*(?:^|/)\.\.?(?:/|$))[^\\]+$")

# Curated canonical snippets conforming to docs/contracts/HACKATHON_MVP_SPEC.md
# Used as high-fidelity fallbacks when sample files are not physically on disk.
CANONICAL_SNIPPETS: dict[str, dict[str, tuple[int, int, str]]] = {
    "service/auth.py": {
        "verify_token": (
            41,
            71,
            (
                "def verify_token(token: str) -> dict[str, Any]:\n"
                '    """Validates bearer tokens."""\n'
                "    if not token or not isinstance(token, str):\n"
                '        raise AuthenticationError("Token is missing or malformed.")\n\n'
                '    parts = token.strip().split(".")\n'
                "    if len(parts) != 3:\n"
                '        raise AuthenticationError("Bearer token format invalid.")\n\n'
                "    user_id, expires_str, signature = parts\n"
                "    try:\n"
                "        expires_at = int(expires_str)\n"
                "    except ValueError as exc:\n"
                '        raise AuthenticationError("Token timestamp is invalid.") from exc\n\n'
                "    current_time = int(time.time())\n"
                "    if current_time > expires_at:\n"
                '        raise AuthenticationError("Bearer token has expired.")\n\n'
                '    expected_data = f"{user_id}:{expires_at}".encode("utf-8")\n'
                "    expected_sig = hmac.new(\n"
                '        TOKEN_SECRET.encode("utf-8"), expected_data, hashlib.sha256\n'
                "    ).hexdigest()\n\n"
                "    if not hmac.compare_digest(signature, expected_sig):\n"
                '        raise AuthenticationError("Token cryptographic signature mismatch.")\n\n'
                "    return {\n"
                '        "sub": user_id,\n'
                '        "user_id": user_id,\n'
                '        "expires_at": expires_at,\n'
                '        "permissions": ["orders:create", "orders:read"],\n'
                "    }"
            ),
        ),
        "_default": (
            1,
            71,
            (
                '"""Authentication and session management module."""\n\n'
                "from __future__ import annotations\n\n"
                "import hashlib\n"
                "import hmac\n"
                "import time\n"
                "from typing import Any\n\n"
                "from service.errors import AuthenticationError\n\n"
                'TOKEN_SECRET = "sample-insecure-secret-key-for-demonstration"\n'
            ),
        ),
    },
    "service/orders.py": {
        "create_order": (
            51,
            121,
            (
                "    def create_order(\n"
                "        self,\n"
                "        token: str,\n"
                "        items: list[dict[str, Any]],\n"
                '        shipping_tier: str = "standard",\n'
                "        discount_code: str | None = None,\n"
                "    ) -> dict[str, Any]:\n"
                '        """Creates and validates a new customer order."""\n'
                "        # Step 1: Perform token signature check\n"
                "        user_payload = verify_token(token)\n"
                '        user_id = user_payload["sub"]'
            ),
        ),
        "_default": (
            1,
            50,
            (
                '"""Order orchestration, inventory checks, and checkout '
                'lifecycle management."""\n\n'
                "from __future__ import annotations\n\n"
                "import uuid\n"
                "from typing import Any\n\n"
                "from service.auth import verify_token\n"
            ),
        ),
    },
    "service/pricing.py": {
        "calculate_fee": (
            25,
            32,
            (
                'def calculate_fee(amount: float, shipping_tier: str = "standard") -> float:\n'
                '    """Calculates order processing and shipping fee based on tier and amount."""\n'
                "    tier = shipping_tier.strip().lower()\n"
                '    if tier == "express":\n'
                "        return 15.0\n"
                '    if tier == "priority":\n'
                "        return 10.0\n"
                "    return 5.0"
            ),
        ),
        "_default": (
            1,
            24,
            (
                '"""Pricing, fee calculation, and discount computation module."""\n\n'
                "from __future__ import annotations\n"
            ),
        ),
    },
    "service/errors.py": {
        "ServiceError": (
            6,
            12,
            (
                "class ServiceError(Exception):\n"
                '    """Base exception for all service domain errors."""\n\n'
                '    def __init__(self, message: str, code: str = "service_error") -> None:\n'
                "        super().__init__(message)\n"
                "        self.message = message\n"
                "        self.code = code"
            ),
        ),
        "_default": (
            1,
            20,
            (
                '"""Domain exception classes for the sample microservice."""\n\n'
                "class ServiceError(Exception):\n"
                '    """Base exception for all service domain errors."""\n\n'
                '    def __init__(self, message: str, code: str = "service_error") -> None:\n'
                "        super().__init__(message)\n"
                "        self.message = message\n"
                "        self.code = code"
            ),
        ),
    },
}


@dataclass(frozen=True)
class RetrievedContext:
    path: str
    range: LineRange
    snippet: str
    content_hash: str

    def to_citation(self) -> CodeCitation:
        return CodeCitation(
            path=self.path,
            range=self.range,
            snippet=self.snippet,
            content_hash=self.content_hash,
        )


def compute_sha256(content: str) -> str:
    """Compute standard sha256:hash prefix."""
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def validate_safe_path(path: str) -> str:
    """Validate relative path to prevent directory traversal and SSRF."""
    normalized = path.strip().replace("\\", "/")
    if not normalized:
        raise ValueError("File path cannot be empty.")
    if not SAFE_PATH_PATTERN.match(normalized):
        raise ValueError(f"Path contains invalid or forbidden sequences: '{path}'")
    return normalized


def find_sample_repo_root() -> Path | None:
    """Locate the root directory of the sample service repository."""
    env_dir = os.environ.get("UNFOG_REPO_DIR")
    if env_dir:
        candidate = Path(env_dir).resolve()
        if candidate.is_dir():
            return candidate

    this_file = Path(__file__).resolve()
    repo_root = this_file.parent.parent.parent.parent
    sample_candidate = repo_root / "samples" / "sample_service"
    if sample_candidate.is_dir():
        return sample_candidate

    cwd_candidate = Path("samples/sample_service").resolve()
    if cwd_candidate.is_dir():
        return cwd_candidate

    parent_candidate = Path("../samples/sample_service").resolve()
    if parent_candidate.is_dir():
        return parent_candidate

    return None


def find_repo_root(repo_id: str | None = None) -> Path | None:
    """Locate the root directory for a given repository or sample service."""
    if repo_id and repo_id not in ("sample_service", "bundled"):
        try:
            from app.codeintel.service import get_codebase_service

            svc = get_codebase_service()
            if hasattr(svc, "get_repo_path"):
                p = svc.get_repo_path(repo_id)
                if p and Path(p).is_dir():
                    return Path(p).resolve()
        except Exception:
            pass

        candidates = [
            Path(f"data/repos/{repo_id}"),
            Path(f"/tmp/unfog_repos/{repo_id}"),
            Path(f"backend/data/repos/{repo_id}"),
        ]
        for c in candidates:
            if c.is_dir():
                return c.resolve()

    return find_sample_repo_root()


def resolve_file_on_disk(rel_path: str, repo_id: str | None = None) -> tuple[Path, str] | None:
    """Safely locate and read a file within the target repository."""
    safe_rel = validate_safe_path(rel_path)
    root = find_repo_root(repo_id)
    if not root:
        return None

    target = (root / safe_rel).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        raise ValueError(f"Path '{rel_path}' escapes the repository root.") from None

    if target.is_file():
        try:
            return target, target.read_text(encoding="utf-8")
        except OSError:
            return None
    return None


def extract_symbol_from_source(
    source_code: str, symbol_name: str | None
) -> tuple[int, int, str] | None:
    """Parse Python source AST to find symbol start and end lines."""
    if not symbol_name:
        return None
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return None

    lines = source_code.splitlines(keepends=True)
    total_lines = len(lines)

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if node.name == symbol_name:
                start = getattr(node, "lineno", 1)
                end = getattr(node, "end_lineno", min(start + 15, total_lines))
                start_clamped = max(1, min(start, total_lines))
                end_clamped = max(start_clamped, min(end, total_lines))
                snippet = "".join(lines[start_clamped - 1 : end_clamped]).rstrip()
                return start_clamped, end_clamped, snippet

    return None


def retrieve_symbol_context(
    path: str,
    symbol_name: str | None = None,
    start_line: int | None = None,
    end_line: int | None = None,
    repo_id: str | None = None,
) -> RetrievedContext:
    """Retrieve grounded code context for a file or symbol with verified line ranges."""
    safe_path = validate_safe_path(path)

    disk_result = resolve_file_on_disk(safe_path, repo_id=repo_id)
    if disk_result:
        _, content = disk_result
        lines = content.splitlines(keepends=True)
        total = len(lines)

        if start_line is not None and end_line is not None:
            s = max(1, min(start_line, total))
            e = max(s, min(end_line, total))
            snip = "".join(lines[s - 1 : e]).rstrip()
            return RetrievedContext(
                path=safe_path,
                range=LineRange(start_line=s, end_line=e),
                snippet=snip,
                content_hash=compute_sha256(snip),
            )

        extracted = extract_symbol_from_source(content, symbol_name)
        if extracted:
            s, e, snip = extracted
            return RetrievedContext(
                path=safe_path,
                range=LineRange(start_line=s, end_line=e),
                snippet=snip,
                content_hash=compute_sha256(snip),
            )

        s = 1
        e = min(30, total)
        snip = "".join(lines[s - 1 : e]).rstrip()
        return RetrievedContext(
            path=safe_path,
            range=LineRange(start_line=s, end_line=e),
            snippet=snip,
            content_hash=compute_sha256(snip),
        )

    # For imported repositories, do not fabricate code that is not on disk
    if repo_id and repo_id not in ("sample_service", "bundled"):
        raise ValueError(f"File '{safe_path}' not found in repository '{repo_id}'.")

    # Sample service fallback
    file_fallbacks = CANONICAL_SNIPPETS.get(safe_path, {})
    if symbol_name and symbol_name in file_fallbacks:
        s, e, snip = file_fallbacks[symbol_name]
    elif "_default" in file_fallbacks:
        s, e, snip = file_fallbacks["_default"]
    else:
        s = 1
        e = 15
        snip = f"# Module: {safe_path}\n# Symbol: {symbol_name or 'main'}\n# Source definition"

    return RetrievedContext(
        path=safe_path,
        range=LineRange(start_line=s, end_line=e),
        snippet=snip,
        content_hash=compute_sha256(snip),
    )


def retrieve_relevant_citations_for_query(
    query: str,
    active_path: str | None = None,
    repo_id: str | None = None,
) -> list[RetrievedContext]:
    """Identify relevant files based on query keywords and active context."""
    results: list[RetrievedContext] = []
    seen_paths: set[str] = set()

    if active_path:
        try:
            safe_active = validate_safe_path(active_path)
            ctx = retrieve_symbol_context(safe_active, repo_id=repo_id)
            results.append(ctx)
            seen_paths.add(safe_active)
        except (ValueError, FileNotFoundError):
            pass

    # For imported multi-repo lookups
    if repo_id and repo_id not in ("sample_service", "bundled"):
        try:
            from app.codeintel.service import get_codebase_service

            svc = get_codebase_service()
            graph = svc.get_graph(repo_id)
            q_lower = query.lower()
            for sym in graph.symbols:
                if sym.name.lower() in q_lower:
                    matching_file = next((f for f in graph.files if f.id == sym.file_id), None)
                    if matching_file and matching_file.path not in seen_paths:
                        results.append(
                            retrieve_symbol_context(
                                matching_file.path,
                                sym.name,
                                repo_id=repo_id,
                            )
                        )
                        seen_paths.add(matching_file.path)
                        if len(results) >= 3:
                            break

            if not results and graph.files:
                first_file = graph.files[0]
                results.append(retrieve_symbol_context(first_file.path, repo_id=repo_id))
        except Exception:
            pass
        return results

    # Sample service keywords
    q = query.lower()
    keywords_to_targets: list[tuple[tuple[str, ...], str, str | None]] = [
        (
            ("error", "exception", "fault", "serviceerror", "authenticationerror"),
            "service/errors.py",
            "ServiceError",
        ),
        (
            ("auth", "token", "jwt", "bearer", "login", "credential", "verify_token"),
            "service/auth.py",
            "verify_token",
        ),
        (
            (
                "order",
                "checkout",
                "cart",
                "inventory",
                "fulfill",
                "process_order",
                "create_order",
            ),
            "service/orders.py",
            "create_order",
        ),
        (
            ("price", "pricing", "fee", "cost", "shipping", "calculate_fee"),
            "service/pricing.py",
            "calculate_fee",
        ),
    ]

    for keywords, path, target_symbol in keywords_to_targets:
        if path not in seen_paths and any(kw in q for kw in keywords):
            ctx = retrieve_symbol_context(path, target_symbol, repo_id=repo_id)
            results.append(ctx)
            seen_paths.add(path)

    if not results:
        results.append(retrieve_symbol_context("service/auth.py", "verify_token", repo_id=repo_id))

    return results
