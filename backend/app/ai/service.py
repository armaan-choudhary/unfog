"""High-level AI service orchestrating grounded context retrieval and Gemini generation."""

from __future__ import annotations

from app.ai.client import call_gemini_generate
from app.ai.context import (
    retrieve_relevant_citations_for_query,
    retrieve_symbol_context,
)
from app.ai.fallbacks import (
    get_deterministic_chat_reply,
    get_deterministic_explanation,
)
from app.ai.schemas import (
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    ExplainResponse,
)

SYSTEM_TUTOR_PROMPT = (
    "You are Unfog AI Companion, an expert software architecture tutor. "
    "Ground all explanations strictly in the provided code snippets and real repository "
    "structure. Be precise, educational, and concise. Never fabricate nonexistent symbols, "
    "relationships, or line numbers. Never leak context across different repositories."
)


class AIService:
    """Orchestrates code explanation and contextual chat with grounded citations."""

    def explain(self, request: ExplainRequest) -> ExplainResponse:
        """Explain a symbol or file, falling back gracefully if Gemini is offline."""
        ctx = retrieve_symbol_context(
            path=request.path,
            symbol_name=request.symbol_name,
            repo_id=request.repo_id,
        )
        target_name = request.symbol_name or ctx.path
        repo_label = request.repo_id or "sample_service"
        default_user_prompt = f"Explain the function and architectural role of {target_name}."

        prompt_text = (
            f"Repository: {repo_label}\n"
            f"File: {ctx.path}\n"
            f"Line Range: {ctx.range.start_line}-{ctx.range.end_line}\n"
            f"Snippet:\n```python\n{ctx.snippet}\n```\n\n"
            f"User Prompt: {request.prompt or default_user_prompt}"
        )

        generated_text, model = call_gemini_generate(
            system_prompt=SYSTEM_TUTOR_PROMPT,
            user_prompt=prompt_text,
        )

        if generated_text:
            explanation = generated_text
            final_model = model
        else:
            explanation = get_deterministic_explanation(
                path=request.path,
                symbol_name=request.symbol_name,
                prompt=request.prompt,
                context=ctx,
                repo_id=request.repo_id,
            )
            final_model = "offline-fallback"

        return ExplainResponse(
            explanation=explanation,
            citations=[ctx.to_citation()],
            provenance="ai_inferred",
            model=final_model,
        )

    def chat(self, request: ChatRequest) -> ChatResponse:
        """Handle conversational queries about the codebase with source citations."""
        contexts = retrieve_relevant_citations_for_query(
            query=request.message,
            active_path=request.active_path,
            repo_id=request.repo_id,
        )

        blocks: list[str] = []
        for c in contexts:
            header = f"File: {c.path} (Lines {c.range.start_line}-{c.range.end_line}):"
            blocks.append(f"{header}\n```python\n{c.snippet}\n```")
        context_blocks = "\n\n".join(blocks)

        repo_label = request.repo_id or "sample_service"
        user_prompt = (
            f"Active Repository: {repo_label}\n"
            f"Relevant Code Context:\n{context_blocks}\n\n"
            f"User Question: {request.message}\n"
            "Answer the question directly, citing the relevant source files and functions."
        )

        generated_text, model = call_gemini_generate(
            system_prompt=SYSTEM_TUTOR_PROMPT,
            user_prompt=user_prompt,
            history=request.history,
        )

        if generated_text:
            reply = generated_text
            final_model = model
        else:
            reply = get_deterministic_chat_reply(
                message=request.message,
                active_path=request.active_path,
                citations=contexts,
                repo_id=request.repo_id,
            )
            final_model = "offline-fallback"

        return ChatResponse(
            reply=reply,
            citations=[c.to_citation() for c in contexts],
            model=final_model,
        )


_service_instance: AIService | None = None


def get_ai_service() -> AIService:
    """Return shared AIService singleton."""
    global _service_instance
    if _service_instance is None:
        _service_instance = AIService()
    return _service_instance
