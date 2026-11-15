"""Versioned API error contract and application exceptions."""

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import UUID4, BaseModel, ConfigDict, Field


class ErrorCode(StrEnum):
    INVALID_REQUEST = "invalid_request"
    UNAUTHENTICATED = "unauthenticated"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RATE_LIMITED = "rate_limited"
    EVIDENCE_UNAVAILABLE = "evidence_unavailable"
    INTERNAL_ERROR = "internal_error"


class ErrorIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    path: str = Field(max_length=256)


class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: ErrorCode
    message: str = Field(min_length=1, max_length=512)
    request_id: UUID4
    retryable: bool
    issues: list[ErrorIssue] | None = None


class ErrorEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    error: ErrorDetail


class ApplicationError(Exception):
    """An expected safe API error with its transport status."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int,
        *,
        retryable: bool = False,
        issues: list[ErrorIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable
        self.issues = issues


def build_error_envelope(
    *,
    code: ErrorCode,
    message: str,
    request_id: UUID,
    retryable: bool,
    issues: list[ErrorIssue] | None = None,
) -> ErrorEnvelope:
    return ErrorEnvelope(
        error=ErrorDetail(
            code=code,
            message=message,
            request_id=request_id,
            retryable=retryable,
            issues=issues,
        )
    )
