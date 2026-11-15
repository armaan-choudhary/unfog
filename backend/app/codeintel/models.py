"""Data models and schemas for code intelligence and source graph contracts."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import UUID4, BaseModel, ConfigDict, Field, field_validator

_PATH_REGEX = re.compile(r"^(?!/)(?!.*(?:^|/)\.\.?(?:/|$))[^\\]+$")
SHA256_REGEX = r"^sha256:[a-f0-9]{64}$"

SymbolKind = Literal[
    "function",
    "class",
    "method",
    "interface",
    "module",
    "variable",
    "property",
    "component",
    "unknown",
]

EdgeKind = Literal[
    "import",
    "contains",
    "calls",
    "extends",
    "references",
    "renders",
    "data_flow",
]

EdgeProvenance = Literal[
    "static_verified",
    "runtime_verified",
    "ai_inferred",
    "unknown",
]


class LineRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)


class SnapshotRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["git_commit", "content_manifest", "local_tree"]
    value: str = Field(min_length=1, max_length=256)


class SnapshotInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID4
    repository_id: UUID4
    repository_name: str | None = Field(default=None, max_length=256)
    revision: SnapshotRevision
    manifest_hash: str = Field(pattern=SHA256_REGEX)


class SourceFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID4
    snapshot_id: UUID4
    path: str = Field(min_length=1, max_length=1024)
    language: str = Field(default="python", min_length=1, max_length=64)
    content_hash: str = Field(pattern=SHA256_REGEX)
    line_count: int = Field(ge=0)

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        if not _PATH_REGEX.match(v):
            raise ValueError(f"Invalid path: {v}")
        return v


class SourceSymbol(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID4
    snapshot_id: UUID4
    file_id: UUID4
    name: str = Field(min_length=1, max_length=512)
    qualified_name: str | None = Field(default=None, max_length=1024)
    kind: SymbolKind
    language: str = Field(default="python", min_length=1, max_length=64)
    docstring: str | None = Field(default=None, max_length=4096)
    range: LineRange


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID4
    snapshot_id: UUID4
    file_id: UUID4
    path: str = Field(min_length=1, max_length=1024)
    range: LineRange
    content_hash: str = Field(pattern=SHA256_REGEX)

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        if not _PATH_REGEX.match(v):
            raise ValueError(f"Invalid path: {v}")
        return v


class SourceEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID4
    snapshot_id: UUID4
    source_symbol_id: UUID4
    target_symbol_id: UUID4
    kind: EdgeKind
    provenance: EdgeProvenance = "static_verified"
    evidence_citation_ids: list[UUID4] = Field(min_length=1)
    analyzer: str | None = Field(default="ast_treesitter", max_length=128)
    analyzer_version: str | None = Field(default="1.0.0", max_length=128)
    confidence: float | None = Field(default=1.0, ge=0.0, le=1.0)


class SourceGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    snapshot: SnapshotInfo
    files: list[SourceFile]
    symbols: list[SourceSymbol]
    citations: list[Citation]
    edges: list[SourceEdge]


class FileSymbolSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID4
    name: str
    kind: SymbolKind
    range: LineRange


class FileDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    language: str
    line_count: int
    content: str
    content_hash: str
    symbols: list[FileSymbolSummary]
