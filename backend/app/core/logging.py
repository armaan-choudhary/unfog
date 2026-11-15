"""Structured application logging with conservative secret redaction."""

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

_ASSIGNMENT_SECRET = re.compile(
    r"(?i)\b(password|passwd|token|secret|api[_-]?key)"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
_AUTHORIZATION_HEADER = re.compile(r"(?i)\b(authorization)(\s*[:=]\s*)([^\r\n]+)")
_BEARER_SECRET = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]+=*")
_URL_CREDENTIALS = re.compile(
    r"(?i)\b((?:postgres(?:ql)?(?:\+\w+)?|mysql(?:\+\w+)?|redis)://)"
    r"[^/@\s]+(@)"
)


def redact_secrets(message: str) -> str:
    """Redact common credentials while preserving useful log context."""
    message = _AUTHORIZATION_HEADER.sub(r"\1\2[REDACTED]", message)
    message = _BEARER_SECRET.sub("Bearer [REDACTED]", message)
    message = _URL_CREDENTIALS.sub(r"\1[REDACTED]\2", message)
    return _ASSIGNMENT_SECRET.sub(r"\1\2[REDACTED]", message)


class RedactingFilter(logging.Filter):
    """Redact interpolated log messages before formatting or emission."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_secrets(record.getMessage())
        record.args = ()
        return True


class JsonLogFormatter(logging.Formatter):
    """Emit only allow-listed structured fields; omit arbitrary extras/exceptions."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", "application_log"),
            "message": redact_secrets(record.getMessage()),
        }
        for key in (
            "request_id",
            "http_method",
            "http_status",
            "duration_ms",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, separators=(",", ":"))


def configure_app_logging() -> logging.Logger:
    logger = logging.getLogger("unfog.api")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not any(handler.name == "unfog-structured-json" for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonLogFormatter())
        handler.name = "unfog-structured-json"
        logger.addHandler(handler)
    if not any(isinstance(item, RedactingFilter) for item in logger.filters):
        logger.addFilter(RedactingFilter())
    return logger
