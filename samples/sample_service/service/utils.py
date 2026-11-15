"""Utility helpers for formatting, identifiers, and sanitization."""

from __future__ import annotations

import re
import secrets


def format_currency(amount: float) -> str:
    """Formats numeric amount as standard currency string."""
    return f"${amount:,.2f}"


def generate_tracking_number() -> str:
    """Generates an order tracking identifier code."""
    token = secrets.token_hex(4).upper()
    return f"TRK-{token}"


def sanitize_input(text: str) -> str:
    """Sanitizes user input by removing non-printable or dangerous characters."""
    if not text:
        return ""
    cleaned = re.sub(r"[^\w\s\-\.\,\@]", "", text)
    return cleaned.strip()
