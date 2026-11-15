"""Gemini client wrapper with key protection and error tolerance."""

from __future__ import annotations

import importlib
import logging
import os
from typing import Any, Sequence

from app.ai.schemas import ChatMessage

logger = logging.getLogger("unfog.ai")

DEFAULT_MODEL = "gemini-2.5-flash"


def get_gemini_model_name() -> str:
    """Retrieve configured Gemini model name from environment."""
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def get_gemini_api_key() -> str | None:
    """Safely retrieve Gemini API key without logging or leaking it."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    return key if key else None


def is_gemini_configured() -> bool:
    """Check if a Gemini API key is available in the environment."""
    return get_gemini_api_key() is not None


def call_gemini_generate(
    system_prompt: str,
    user_prompt: str,
    history: Sequence[ChatMessage] = (),
) -> tuple[str | None, str]:
    """Call Google GenAI SDK to generate content, returning (response_text, model_name).

    Guarantees no exceptions escape; returns (None, model_name) on any failure.
    API keys are protected server-side and never exposed.
    """
    model_name = get_gemini_model_name()
    api_key = get_gemini_api_key()

    if not api_key:
        logger.info(
            "gemini_not_configured",
            extra={"event": "gemini_not_configured", "model": model_name},
        )
        return None, model_name

    try:
        genai = importlib.import_module("google.genai")
        types = importlib.import_module("google.genai.types")

        client = genai.Client(api_key=api_key)

        contents: list[Any] = []
        for msg in history:
            role = "user" if msg.role == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.content)],
                )
            )

        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_prompt)],
            )
        )

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
        )

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

        if response and response.text:
            return response.text.strip(), model_name

        logger.warning(
            "gemini_empty_response",
            extra={"event": "gemini_empty_response", "model": model_name},
        )
        return None, model_name

    except Exception as exc:
        logger.warning(
            "gemini_api_call_failed",
            extra={
                "event": "gemini_api_call_failed",
                "model": model_name,
                "error_type": type(exc).__name__,
            },
        )
        return None, model_name
