"""Graceful, deterministic offline explanations and citations for demo resilience."""

from __future__ import annotations

from app.ai.context import RetrievedContext


def get_deterministic_explanation(
    path: str,
    symbol_name: str | None,
    prompt: str | None,
    context: RetrievedContext,
    repo_id: str | None = None,
) -> str:
    """Generate a high-quality, grounded explanation when Gemini is offline or unconfigured."""
    if repo_id and repo_id not in ("sample_service", "bundled"):
        line_info = f"lines {context.range.start_line}–{context.range.end_line}"
        header = f"Code analysis for `{symbol_name or path}` in repository `{repo_id}`"
        is_frontend = path.endswith((".jsx", ".tsx", ".js", ".ts", ".mts", ".cts"))
        if is_frontend:
            role = (
                f"This component or module implements frontend presentation in `{path}`. "
                "It defines UI rendering structure, component props, and event handling. "
            )
        else:
            role = f"This symbol defines the {symbol_name or 'module'} implementation. "
        return (
            f"{header} ({path}, {line_info}):\n\n"
            f"{role}"
            "In offline fallback mode, automated generative explanations are disabled. "
            "Refer to the exact source lines cited above for implementation logic."
        )

    p = path.lower()
    s = (symbol_name or "").lower()

    if "auth" in p or s == "verify_token":
        return (
            "The `verify_token` function in `service/auth.py` validates incoming bearer tokens. "
            "It checks that the authorization header contains a well-formed Bearer token, "
            "verifies the cryptographic signature against the secret key, and ensures that the "
            "expiration claim (`exp`) remains valid. If verification succeeds, it returns the "
            "decoded claims payload; otherwise, it raises an `AuthenticationError`."
        )

    if "order" in p or s in ("create_order", "process_order"):
        return (
            "The `create_order` method in `service/orders.py` orchestrates the order lifecycle. "
            "It begins by validating caller identity via `verify_token`, validates order schema, "
            "calculates necessary shipping and processing fees via `calculate_fee` in "
            "`service/pricing.py`, and finally yields a confirmed order record with a UUID."
        )

    if "pricing" in p or s == "calculate_fee":
        return (
            "The `calculate_fee` function in `service/pricing.py` calculates transaction and "
            "handling fees. Orders with standard shipping incur a 5% baseline fee, whereas "
            "expedited options apply a 10% fee. Negative order amounts are rejected immediately "
            "with a `ValueError`."
        )

    if "error" in p or "serviceerror" in s:
        return (
            "The `service/errors.py` module establishes standardized exception handling for "
            "the service. `ServiceError` provides the root exception structure with "
            "machine-readable error codes, and subclasses like `AuthenticationError` represent "
            "distinct domain failure modes."
        )

    line_info = f"lines {context.range.start_line}–{context.range.end_line}"
    return (
        f"Analysis of `{symbol_name or path}` in `{path}` ({line_info}):\n\n"
        f"This component implements core service capabilities for `{path}`. "
        "It encapsulates domain logic and enforces input validation and state invariants."
    )


def get_deterministic_chat_reply(
    message: str,
    active_path: str | None,
    citations: list[RetrievedContext],
    repo_id: str | None = None,
) -> str:
    """Generate a deterministic, grounded response for codebase Q&A."""
    if repo_id and repo_id not in ("sample_service", "bundled"):
        primary = citations[0] if citations else None
        ref_text = f" in `{primary.path}`" if primary else ""
        return (
            f"Repository `{repo_id}` query analysis: The relevant implementation{ref_text} manages "
            "the requested behavior. In offline fallback mode, generative chat is disabled. "
            "See the cited source lines for the exact implementation details."
        )

    m = message.lower()

    if any(k in m for k in ("error", "exception", "fault")):
        return (
            "Errors are handled in `service/errors.py` using custom exception classes like "
            "`ServiceError` and `AuthenticationError`. These encapsulate standardized error codes "
            "and messages that upstream handlers translate into HTTP error responses."
        )

    if any(k in m for k in ("auth", "token", "jwt", "login", "bearer", "verify")):
        return (
            "Authentication is centralized in `service/auth.py`. Incoming HTTP requests must "
            "present a Bearer token, which `verify_token` verifies against cryptographic signature "
            "and expiration deadlines before extracting user claims."
        )

    if any(k in m for k in ("order", "checkout", "cart", "flow", "fulfill")):
        return (
            "The order workflow is defined in `service/orders.py`. When an order is submitted, "
            "the system verifies the bearer token signature, validates order item payloads, "
            "computes processing fees with `pricing.py`, and confirms fulfillment."
        )

    if any(k in m for k in ("price", "pricing", "fee", "cost", "shipping")):
        return (
            "Pricing and fee computations are maintained in `service/pricing.py`. The "
            "`calculate_fee` routine applies a standard 5% fee or a 10% express rate to the "
            "order amount."
        )

    primary = citations[0] if citations else None
    ref_text = f" in `{primary.path}`" if primary else ""
    return (
        f"Based on the repository structure, the relevant logic{ref_text} manages service "
        "interactions and data flow. See the cited source lines for the exact implementation "
        "details."
    )
