"""Authentication and session management module."""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

from service.errors import AuthenticationError

TOKEN_SECRET = "sample-insecure-secret-key-for-demonstration"


def hash_password(password: str) -> str:
    """Hashes a plaintext password using SHA-256 with salt."""
    salt = "unfog-salt"
    salted = f"{salt}:{password}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


def create_session(user_id: str) -> dict[str, Any]:
    """Generates a session payload with bearer token and expiration."""
    expires_at = int(time.time()) + 3600
    signature_data = f"{user_id}:{expires_at}".encode("utf-8")
    signature = hmac.new(TOKEN_SECRET.encode("utf-8"), signature_data, hashlib.sha256).hexdigest()
    token = f"{user_id}.{expires_at}.{signature}"
    return {
        "user_id": user_id,
        "token": token,
        "expires_at": expires_at,
    }


def check_permission(user: dict[str, Any], permission: str) -> bool:
    """Checks whether user payload contains the requested permission."""
    permissions: list[str] = user.get("permissions", [])
    return permission in permissions or "admin" in permissions


def verify_token(token: str) -> dict[str, Any]:
    """Validates bearer tokens."""
    if not token or not isinstance(token, str):
        raise AuthenticationError("Token is missing or malformed.")

    parts = token.strip().split(".")
    if len(parts) != 3:
        raise AuthenticationError("Bearer token format invalid.")

    user_id, expires_str, signature = parts
    try:
        expires_at = int(expires_str)
    except ValueError as exc:
        raise AuthenticationError("Token timestamp is invalid.") from exc

    current_time = int(time.time())
    if current_time > expires_at:
        raise AuthenticationError("Bearer token has expired.")

    expected_data = f"{user_id}:{expires_at}".encode("utf-8")
    expected_sig = hmac.new(TOKEN_SECRET.encode("utf-8"), expected_data, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        raise AuthenticationError("Token cryptographic signature mismatch.")

    return {
        "sub": user_id,
        "user_id": user_id,
        "expires_at": expires_at,
        "permissions": ["orders:create", "orders:read"],
    }
