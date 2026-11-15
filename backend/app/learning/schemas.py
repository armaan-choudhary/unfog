"""Pydantic schemas for the Learning Arena API."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.ai.schemas import CodeCitation


class Challenge(BaseModel):
    """A code understanding challenge presented to the user."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(description="Unique challenge identifier")
    type: Literal["locate", "trace", "predict"] = Field(
        description="Challenge type: locate, trace, or predict"
    )
    title: str = Field(description="Human-readable title of the challenge")
    prompt: str = Field(description="Challenge instruction or question prompt")
    options: list[str] = Field(description="Available answer choices")
    target_path: str = Field(description="Target repository file associated with the challenge")
    hint: str = Field(description="Educational hint pointing the learner in the right direction")


class EvaluateRequest(BaseModel):
    """User submission for challenge evaluation."""

    model_config = ConfigDict(frozen=True)

    answer: str = Field(description="Selected option or student answer string")
    selected_symbol_id: UUID | str | None = Field(
        default=None, description="Optional symbol UUID selected by user in UI"
    )
    selected_path: str | None = Field(
        default=None, description="Optional source file path selected by user"
    )


class EvaluateResponse(BaseModel):
    """Evaluation result with score, feedback, and verifiable code citations."""

    model_config = ConfigDict(frozen=True)

    is_correct: bool = Field(description="Whether the submitted answer was correct")
    score: int = Field(ge=0, le=100, description="Score achieved (0-100)")
    feedback: str = Field(description="Pedagogical feedback explaining the answer")
    citations: list[CodeCitation] = Field(
        default_factory=list, description="Source code citations evidencing the answer"
    )
