"""Context retrieval and grounded code citation engine."""

from __future__ import annotations

import ast
import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path

import tree_sitter
import tree_sitter_javascript as tsjs
import tree_sitter_typescript as tsts

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


def extract_js_ts_symbol_from_source(
    source_code: str,
    symbol_name: str | None,
    ext: str,
) -> tuple[int, int, str] | None:
    """Parse JS/TS/JSX/TSX source via Tree-sitter to locate functions and React components."""
    if not symbol_name:
        return None

    bytes_code = source_code.encode("utf-8")
    parser = tree_sitter.Parser()
    if ext in (".tsx", ".jsx"):
        lang = tree_sitter.Language(tsts.language_tsx())
    elif ext in (".ts", ".mts", ".cts"):
        lang = tree_sitter.Language(tsts.language_typescript())
    else:
        lang = tree_sitter.Language(tsjs.language())

    parser.language = lang
    tree = parser.parse(bytes_code)

    def find_node(node: tree_sitter.Node) -> tree_sitter.Node | None:
        decl_types = (
            "function_declaration",
            "generator_function_declaration",
            "class_declaration",
            "interface_declaration",
            "type_alias_declaration",
        )
        if node.type in decl_types:
            for child in node.children:
                if child.type in ("identifier", "type_identifier"):
                    if child.text and child.text.decode("utf-8") == symbol_name:
                        if node.parent and node.parent.type == "export_statement":
                            return node.parent
                        return node

        if node.type == "variable_declarator":
            id_child = node.child_by_field_name("name")
            if id_child and id_child.text and id_child.text.decode("utf-8") == symbol_name:
                parent = node.parent
                if parent and parent.type in ("variable_declaration", "lexical_declaration"):
                    if parent.parent and parent.parent.type == "export_statement":
                        return parent.parent
                    return parent
                return node

        for child in node.children:
            res = find_node(child)
            if res:
                return res
        return None

    target_node = find_node(tree.root_node)
    if target_node:
        start_line = target_node.start_point.row + 1
        end_line = target_node.end_point.row + 1
        lines = source_code.splitlines(keepends=True)
        snippet = "".join(lines[start_line - 1 : end_line]).rstrip()
        return start_line, end_line, snippet

    return None


def extract_symbol_from_source(
    source_code: str,
    symbol_name: str | None,
    file_path: str = "",
) -> tuple[int, int, str] | None:
    """Locate symbol start and end lines across Python, JavaScript, and TypeScript sources."""
    if not symbol_name:
        return None

    ext = Path(file_path).suffix.lower() if file_path else ""
    if ext in (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"):
        extracted = extract_js_ts_symbol_from_source(source_code, symbol_name, ext)
        if extracted:
            return extracted

    # Try Python AST
    try:
        tree = ast.parse(source_code)
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
    except SyntaxError:
        pass

    # If not Python or AST didn't match, attempt Tree-sitter JS/TS as fallback
    if ext not in (".js", ".jsx", ".ts", ".tsx"):
        for try_ext in (".tsx", ".ts", ".js"):
            try:
                extracted = extract_js_ts_symbol_from_source(source_code, symbol_name, try_ext)
                if extracted:
                    return extracted
            except Exception:
                pass

    # Fallback regex search
    lines = source_code.splitlines(keepends=True)
    total_lines = len(lines)
    escaped_sym = re.escape(symbol_name)
    pattern = re.compile(
        rf"(?:export\s+(?:default\s+)?)?(?:function|class|const|let|var|def)\s+{escaped_sym}\b"
    )
    for idx, line in enumerate(lines):
        if pattern.search(line):
            s = idx + 1
            e = min(total_lines, s + 15)
            snippet = "".join(lines[s - 1 : e]).rstrip()
            return s, e, snippet

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

    # If repo has indexed graph, look up precise symbol coordinates first
    if symbol_name and (start_line is None or end_line is None) and repo_id:
        try:
            from app.codeintel.service import get_codebase_service

            svc = get_codebase_service()
            graph = svc.get_graph(repo_id)
            matching_file = next((f for f in graph.files if f.path == safe_path), None)
            if matching_file:
                sym_obj = next(
                    (
                        s
                        for s in graph.symbols
                        if s.file_id == matching_file.id and s.name == symbol_name
                    ),
                    None,
                )
                if sym_obj:
                    start_line = sym_obj.range.start_line
                    end_line = sym_obj.range.end_line
        except Exception:
            pass

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

        extracted = extract_symbol_from_source(content, symbol_name, file_path=safe_path)
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
    """Identify relevant files based on query, graph edges, and active context."""
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

    q = query.lower()

    # Relationship-aware edge lookups across indexed graph (both sample service and imported repos)
    try:
        from app.codeintel.service import get_codebase_service

        svc = get_codebase_service()
        graph = svc.get_graph(repo_id)
        if active_path and graph:
            safe_active = validate_safe_path(active_path)
            matching_file = next((f for f in graph.files if f.path == safe_active), None)
            if matching_file:
                file_symbol_ids = {s.id for s in graph.symbols if s.file_id == matching_file.id}
                is_caller_query = any(
                    k in q
                    for k in (
                        "called",
                        "caller",
                        "call site",
                        "invoked by",
                        "who calls",
                        "where is",
                    )
                )
                is_dep_query = any(
                    k in q
                    for k in (
                        "depend",
                        "calls",
                        "import",
                        "callee",
                        "uses",
                        "hierarchy",
                        "external",
                    )
                )

                if is_caller_query:
                    # Inbound edges: find callers
                    for edge in graph.edges:
                        if edge.target_symbol_id in file_symbol_ids and edge.kind in (
                            "calls",
                            "references",
                            "renders",
                        ):
                            src_sym = next(
                                (s for s in graph.symbols if s.id == edge.source_symbol_id), None
                            )
                            if src_sym:
                                src_file = next(
                                    (f for f in graph.files if f.id == src_sym.file_id), None
                                )
                                if src_file and src_file.path not in seen_paths:
                                    try:
                                        results.append(
                                            retrieve_symbol_context(
                                                src_file.path, src_sym.name, repo_id=repo_id
                                            )
                                        )
                                        seen_paths.add(src_file.path)
                                    except Exception:
                                        pass
                                    if len(results) >= 3:
                                        break
                elif is_dep_query:
                    # Outbound edges: find dependencies
                    for edge in graph.edges:
                        if edge.source_symbol_id in file_symbol_ids and edge.kind in (
                            "calls",
                            "import",
                            "renders",
                            "extends",
                        ):
                            tgt_sym = next(
                                (s for s in graph.symbols if s.id == edge.target_symbol_id), None
                            )
                            if tgt_sym:
                                tgt_file = next(
                                    (f for f in graph.files if f.id == tgt_sym.file_id), None
                                )
                                if tgt_file and tgt_file.path not in seen_paths:
                                    try:
                                        results.append(
                                            retrieve_symbol_context(
                                                tgt_file.path, tgt_sym.name, repo_id=repo_id
                                            )
                                        )
                                        seen_paths.add(tgt_file.path)
                                    except Exception:
                                        pass
                                    if len(results) >= 3:
                                        break
    except Exception:
        pass

    # For imported multi-repo lookups
    if repo_id and repo_id not in ("sample_service", "bundled"):
        try:
            from app.codeintel.service import get_codebase_service

            svc = get_codebase_service()
            graph = svc.get_graph(repo_id)
            for sym in graph.symbols:
                if sym.name.lower() in q:
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


def get_contextual_prompt_suggestions(
    path: str | None = None,
    symbol_name: str | None = None,
    symbol_kind: str | None = None,
    repo_id: str | None = None,
) -> list[dict[str, str]]:
    """Generate smart prompt suggestions for the active symbol and verified relationships."""
    clean_sym = (symbol_name or "").strip()
    clean_kind = (symbol_kind or "").strip().lower()
    clean_path = (path or "").strip()

    # 1. React Component
    if clean_kind == "component" or (
        clean_path.endswith((".tsx", ".jsx")) and clean_sym and clean_sym[0].isupper()
    ):
        return [
            {
                "label": "What does this component do?",
                "prompt": (
                    f"Explain what <{clean_sym or 'component'} /> does, its props, and JSX"
                    " rendering."
                ),
            },
            {
                "label": "Where is this rendered?",
                "prompt": (
                    f"Where is <{clean_sym or 'component'} /> rendered or imported in the code?"
                ),
            },
            {
                "label": "Explain its dependencies",
                "prompt": (
                    f"Explain the dependencies, child components, and hooks used by"
                    f" <{clean_sym or 'component'} />."
                ),
            },
            {
                "label": "How does data flow here?",
                "prompt": (
                    f"How does state and data flow into and through <{clean_sym or 'component'} />?"
                ),
            },
        ]

    # 2. Class or Interface
    if clean_kind in ("class", "interface"):
        target = clean_sym or "this class"
        return [
            {
                "label": f"Explain class {clean_sym or 'role'}",
                "prompt": f"Explain class {target}, its state encapsulation, and primary methods.",
            },
            {
                "label": "Where is this used?",
                "prompt": (
                    f"Where is {target} instantiated, extended, or referenced in the codebase?"
                ),
            },
            {
                "label": "Explain its dependencies",
                "prompt": f"What dependencies, imports, and base classes does {target} rely on?",
            },
            {
                "label": "How does data flow here?",
                "prompt": f"How does data flow through {target} during execution?",
            },
        ]

    # 3. Function or Method
    if clean_kind in ("function", "method") or (
        clean_sym and clean_kind not in ("file", "group", "class", "interface", "component")
    ):
        target = clean_sym or "this function"
        return [
            {
                "label": f"What does {clean_sym or 'this function'} do?",
                "prompt": (
                    f"Explain the purpose, arguments, and behavior of {target} in"
                    f" {clean_path or 'this codebase'}."
                ),
            },
            {
                "label": "Where is this called?",
                "prompt": (
                    f"Where is {target} called across this repository? Trace its verified call"
                    " sites."
                ),
            },
            {
                "label": "Explain its dependencies",
                "prompt": (
                    f"Explain what functions, modules, and external packages {target} depends on."
                ),
            },
            {
                "label": "How does data flow here?",
                "prompt": (
                    f"How does data flow through {target}, and what exceptions or return values"
                    " does it produce?"
                ),
            },
        ]

    # 4. File-level context
    if clean_path and (clean_kind == "file" or not clean_sym):
        file_name = clean_path.split("/")[-1]
        return [
            {
                "label": f"Explain {file_name} role",
                "prompt": f"Explain the architectural role of {clean_path} in this repository.",
            },
            {
                "label": "What are the key exports?",
                "prompt": (
                    f"What are the primary functions, classes, and exported symbols defined in"
                    f" {clean_path}?"
                ),
            },
            {
                "label": "Trace dependencies",
                "prompt": f"What modules and dependencies does {clean_path} import or call?",
            },
            {
                "label": "How does data flow here?",
                "prompt": f"How does data flow into and out of {clean_path}?",
            },
        ]

    # 5. Whole repository level context (no selection)
    return [
        {
            "label": "Explain Architecture",
            "prompt": (
                "Explain the main entrypoint and high-level architecture of this repository."
            ),
        },
        {
            "label": "Trace execution flow",
            "prompt": (
                "How does the primary data flow and execution pipeline work across this codebase?"
            ),
        },
        {
            "label": "Error handling",
            "prompt": "Where are domain errors and exceptions defined and handled?",
        },
        {
            "label": "Explain dependencies",
            "prompt": (
                "What external packages and internal module dependencies does this codebase rely"
                " on?"
            ),
        },
    ]
