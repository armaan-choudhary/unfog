"""Pydantic schemas for the Gemini AI explanation and chat API."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LineRange(BaseModel):
    """Line range within a source file (1-indexed, inclusive)."""

    model_config = ConfigDict(frozen=True)

    start_line: int = Field(ge=1, description="1-indexed starting line number")
    end_line: int = Field(ge=1, description="1-indexed ending line number")


class CodeCitation(BaseModel):
    """Verifiable code citation linked to a source file line range."""

    model_config = ConfigDict(frozen=True)

    path: str = Field(description="Repository-relative file path")
    range: LineRange = Field(description="Line range of the cited snippet")
    snippet: str = Field(description="Source code snippet text")
    content_hash: str | None = Field(default=None, description="SHA-256 hash of snippet/file")


class ExplainRequest(BaseModel):
    """Request payload to explain a symbol or code file."""

    model_config = ConfigDict(frozen=True)

    symbol_id: UUID | str | None = Field(default=None, description="Optional symbol UUID")
    path: str = Field(description="Relative path of file containing the symbol")
    symbol_name: str | None = Field(default=None, description="Name of symbol to explain")
    prompt: str | None = Field(
        default=None, description="Optional specific prompt or question about the symbol"
    )
    repo_id: str | None = Field(
        default=None, description="Optional repository identifier for multi-repo support"
    )


class ExplainResponse(BaseModel):
    """Structured response containing explanation, citations, and provenance."""

    model_config = ConfigDict(frozen=True)

    explanation: str = Field(description="Detailed architectural or functional explanation")
    citations: list[CodeCitation] = Field(
        default_factory=list, description="Verifiable code citations"
    )
    provenance: Literal["static_verified", "runtime_verified", "ai_inferred", "unknown"] = (
        "ai_inferred"
    )
    model: str = Field(description="Model used to generate the explanation (e.g. gemini-2.5-flash)")


class ChatMessage(BaseModel):
    """A single message turn in conversational context."""

    model_config = ConfigDict(frozen=True)

    role: Literal["user", "model", "assistant"] = Field(
        description="Role of the message author ('user', 'model', or 'assistant')"
    )
    content: str = Field(description="Message text content")


class ChatRequest(BaseModel):
    """Contextual conversation request about the codebase."""

    model_config = ConfigDict(frozen=True)

    message: str = Field(description="User message or question")
    active_node_id: UUID | str | None = Field(
        default=None, description="Optional active graph node or symbol UUID"
    )
    active_path: str | None = Field(
        default=None, description="Optional active file path currently selected in UI"
    )
    history: list[ChatMessage] = Field(
        default_factory=list, description="Prior conversation history"
    )
    repo_id: str | None = Field(
        default=None, description="Optional repository identifier for multi-repo support"
    )


class ChatResponse(BaseModel):
    """Contextual conversation response with grounded citations."""

    model_config = ConfigDict(frozen=True)

    reply: str = Field(description="Assistant response text")
    citations: list[CodeCitation] = Field(
        default_factory=list, description="Grounded code citations supporting the answer"
    )
    model: str = Field(description="Model used for generation")
