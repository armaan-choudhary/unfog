"""Codebase service providing cached graph index and safe file content inspection."""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath
from threading import Lock

from app.codeintel.hasher import compute_content_hash
from app.codeintel.models import FileDetailResponse, FileSymbolSummary, SourceGraph
from app.codeintel.scanner import build_source_graph
from app.core.errors import ApplicationError, ErrorCode


def find_sample_service_dir() -> Path:
    """Discovers the sample service root directory across standard workspace layouts."""
    env_path = os.getenv("UNFOG_SAMPLE_SERVICE_PATH")
    if env_path:
        candidate = Path(env_path)
        if candidate.is_dir():
            return candidate.resolve()

    candidates = [
        Path("samples/sample_service"),
        Path("../samples/sample_service"),
        Path(__file__).resolve().parents[3] / "samples" / "sample_service",
    ]
    for candidate in candidates:
        if candidate.is_dir():
            return candidate.resolve()
    return candidates[-1]


class CodebaseService:
    """Thread-safe service managing codebase graph state and source inspection."""

    def __init__(
        self,
        root_dir: Path | None = None,
        repository_name: str = "sample_service",
    ) -> None:
        self.root_dir = root_dir if root_dir is not None else find_sample_service_dir()
        self.repository_name = repository_name
        self._graph: SourceGraph | None = None
        self._lock = Lock()

    def get_graph(self, refresh: bool = False) -> SourceGraph:
        """Returns the active SourceGraph, generating and caching it if needed."""
        with self._lock:
            if self._graph is None or refresh:
                self._graph = build_source_graph(
                    self.root_dir,
                    repository_name=self.repository_name,
                )
            return self._graph

    def get_file(self, relative_path: str) -> FileDetailResponse:
        """Returns file content, line count, and symbols after path safety validation."""
        if not relative_path:
            raise ApplicationError(
                code=ErrorCode.INVALID_REQUEST,
                message="Path parameter must not be empty.",
                status_code=400,
            )

        clean_path = relative_path.replace("\\", "/").strip()
        if clean_path.startswith("/") or clean_path.startswith("./"):
            clean_path = clean_path.lstrip("/").lstrip("./")

        posix = PurePosixPath(clean_path)
        if ".." in posix.parts or posix.is_absolute():
            raise ApplicationError(
                code=ErrorCode.FORBIDDEN,
                message="Path traversal is not permitted.",
                status_code=403,
            )

        target_file = (self.root_dir / posix).resolve()
        try:
            target_file.relative_to(self.root_dir)
        except ValueError as exc:
            raise ApplicationError(
                code=ErrorCode.FORBIDDEN,
                message="Access outside repository root is not permitted.",
                status_code=403,
            ) from exc

        if not target_file.is_file():
            raise ApplicationError(
                code=ErrorCode.NOT_FOUND,
                message=f"File '{clean_path}' not found in repository.",
                status_code=404,
            )

        try:
            content = target_file.read_text(encoding="utf-8")
        except Exception as exc:
            raise ApplicationError(
                code=ErrorCode.INTERNAL_ERROR,
                message="Failed to read file contents.",
                status_code=500,
            ) from exc

        lines = content.splitlines()
        line_count = len(lines)
        content_hash = compute_content_hash(content)

        # Retrieve symbols for this file from the graph
        graph = self.get_graph()
        file_symbols: list[FileSymbolSummary] = []
        for sym in graph.symbols:
            matching_file = next((f for f in graph.files if f.id == sym.file_id), None)
            if matching_file and matching_file.path == clean_path:
                file_symbols.append(
                    FileSymbolSummary(
                        id=sym.id,
                        name=sym.name,
                        kind=sym.kind,
                        range=sym.range,
                    )
                )

        return FileDetailResponse(
            path=clean_path,
            language="python",
            line_count=line_count,
            content=content,
            content_hash=content_hash,
            symbols=file_symbols,
        )


_DEFAULT_SERVICE: CodebaseService | None = None
_SERVICE_LOCK = Lock()


def get_codebase_service() -> CodebaseService:
    """Returns the singleton CodebaseService instance."""
    global _DEFAULT_SERVICE
    with _SERVICE_LOCK:
        if _DEFAULT_SERVICE is None:
            _DEFAULT_SERVICE = CodebaseService()
        return _DEFAULT_SERVICE
