"""Codebase service providing multi-repository graph indexing and safe file inspection."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from threading import Lock
from typing import Any

from app.codeintel.hasher import compute_content_hash
from app.codeintel.models import FileDetailResponse, FileSymbolSummary, SourceGraph
from app.codeintel.scanner import build_source_graph, detect_file_language
from app.core.errors import ApplicationError, ErrorCode

DEFAULT_REPO_ID = "sample_service"


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


@dataclass
class RepositoryEntry:
    repo_id: str
    root_dir: Path
    repository_name: str
    graph: SourceGraph | None = None


class CodebaseService:
    """Thread-safe multi-repository manager for codebase graph state and source inspection."""

    def __init__(
        self,
        root_dir: Path | None = None,
        repository_name: str = "sample_service",
    ) -> None:
        self.default_root_dir = root_dir if root_dir is not None else find_sample_service_dir()
        self.default_repo_name = repository_name
        self._lock = Lock()
        self._repos: dict[str, RepositoryEntry] = {}

        # Register default bundled repository
        self._repos[DEFAULT_REPO_ID] = RepositoryEntry(
            repo_id=DEFAULT_REPO_ID,
            root_dir=self.default_root_dir,
            repository_name=self.default_repo_name,
        )

    @property
    def root_dir(self) -> Path:
        """Backwards compatibility property returning default repository directory."""
        return self.default_root_dir

    @property
    def repository_name(self) -> str:
        """Backwards compatibility property returning default repository name."""
        return self.default_repo_name

    def register_repository(
        self,
        repo_id: str,
        root_dir: Path,
        repository_name: str,
    ) -> SourceGraph:
        """Registers a new repository on disk and immediately generates its SourceGraph."""
        if not repo_id or not repo_id.strip():
            raise ApplicationError(
                code=ErrorCode.INVALID_REQUEST,
                message="Repository ID must not be empty.",
                status_code=400,
            )
        resolved_dir = root_dir.resolve()
        if not resolved_dir.is_dir():
            raise ApplicationError(
                code=ErrorCode.NOT_FOUND,
                message=f"Repository directory does not exist: {root_dir}",
                status_code=404,
            )

        with self._lock:
            graph = build_source_graph(
                resolved_dir,
                repository_name=repository_name,
            )
            self._repos[repo_id] = RepositoryEntry(
                repo_id=repo_id,
                root_dir=resolved_dir,
                repository_name=repository_name,
                graph=graph,
            )
            return graph

    def get_repo_path(self, repo_id: str | None = None) -> Path:
        """Returns root directory Path on disk for the specified or default repository."""
        target_id = repo_id if repo_id is not None and repo_id.strip() else DEFAULT_REPO_ID
        with self._lock:
            entry = self._repos.get(target_id)
            if entry is None:
                raise ApplicationError(
                    code=ErrorCode.NOT_FOUND,
                    message=f"Repository '{target_id}' not found.",
                    status_code=404,
                )
            return entry.root_dir

    def get_graph(
        self,
        repo_id: str | None = None,
        refresh: bool = False,
    ) -> SourceGraph:
        """Returns the SourceGraph for the specified or default repository."""
        target_id = repo_id if repo_id is not None and repo_id.strip() else DEFAULT_REPO_ID
        with self._lock:
            entry = self._repos.get(target_id)
            if entry is None:
                raise ApplicationError(
                    code=ErrorCode.NOT_FOUND,
                    message=f"Repository '{target_id}' not found.",
                    status_code=404,
                )
            if entry.graph is None or refresh:
                entry.graph = build_source_graph(
                    entry.root_dir,
                    repository_name=entry.repository_name,
                )
            return entry.graph

    def get_file(
        self,
        relative_path: str,
        repo_id: str | None = None,
    ) -> FileDetailResponse:
        """Returns file content, line count, and symbols after path safety validation."""
        if not relative_path:
            raise ApplicationError(
                code=ErrorCode.INVALID_REQUEST,
                message="Path parameter must not be empty.",
                status_code=400,
            )

        target_id = repo_id if repo_id is not None and repo_id.strip() else DEFAULT_REPO_ID
        with self._lock:
            entry = self._repos.get(target_id)
            if entry is None:
                raise ApplicationError(
                    code=ErrorCode.NOT_FOUND,
                    message=f"Repository '{target_id}' not found.",
                    status_code=404,
                )
            repo_root = entry.root_dir

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

        target_file = (repo_root / posix).resolve()
        try:
            target_file.relative_to(repo_root)
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
        graph = self.get_graph(repo_id=target_id)
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
            language=detect_file_language(clean_path),
            line_count=line_count,
            content=content,
            content_hash=content_hash,
            symbols=file_symbols,
        )

    def list_repositories(self) -> list[dict[str, Any]]:
        """Returns metadata for all registered repositories."""
        with self._lock:
            return [
                {
                    "repo_id": entry.repo_id,
                    "repository_name": entry.repository_name,
                    "root_dir": str(entry.root_dir),
                    "indexed": entry.graph is not None,
                }
                for entry in self._repos.values()
            ]


_DEFAULT_SERVICE: CodebaseService | None = None
_SERVICE_LOCK = Lock()


def get_codebase_service() -> CodebaseService:
    """Returns the singleton CodebaseService instance."""
    global _DEFAULT_SERVICE
    with _SERVICE_LOCK:
        if _DEFAULT_SERVICE is None:
            _DEFAULT_SERVICE = CodebaseService()
        return _DEFAULT_SERVICE
