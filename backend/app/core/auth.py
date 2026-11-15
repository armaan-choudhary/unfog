"""OIDC bearer authentication and identity resolution."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Annotated, Any, Callable, Protocol

import jwt
from fastapi import Depends, Header, Request
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ApplicationError, ErrorCode
from app.db.models import User
from app.db.session import get_db_session

LOCAL_DEV_ISSUER = "urn:unfog:local-development"
REQUIRED_IDENTITY_CLAIMS = ["exp", "iss", "aud", "sub", "email", "email_verified", "scope"]


class InvalidBearerToken(Exception):
    """The bearer token is invalid, expired, or not intended for this API."""


class AuthenticationProviderUnavailable(Exception):
    """The configured JWKS endpoint could not be reached."""


class SigningKey(Protocol):
    key: Any
    algorithm_name: str


class JwksProvider(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> SigningKey: ...


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    issuer: str
    subject: str
    email: str
    scopes: frozenset[str]


class OIDCBearerVerifier:
    """Verify configured OIDC JWT access tokens with a bounded JWKS client."""

    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        algorithms: tuple[str, ...],
        jwks_provider: JwksProvider,
    ) -> None:
        self.issuer = issuer
        self.audience = audience
        self.algorithms = algorithms
        self.jwks_provider = jwks_provider

    def verify(self, token: str) -> VerifiedIdentity:
        try:
            header = jwt.get_unverified_header(token)
            algorithm = header.get("alg")
            key_id = header.get("kid")
            if algorithm not in self.algorithms or not isinstance(key_id, str) or not key_id:
                raise InvalidBearerToken
            signing_key = self.jwks_provider.get_signing_key_from_jwt(token)
            if signing_key.algorithm_name != algorithm:
                raise InvalidBearerToken
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=list(self.algorithms),
                issuer=self.issuer,
                audience=self.audience,
                leeway=0,
                options={"require": REQUIRED_IDENTITY_CLAIMS},
            )
        except PyJWKClientConnectionError as exc:
            raise AuthenticationProviderUnavailable from exc
        except (PyJWKClientError, jwt.PyJWTError, TypeError, ValueError) as exc:
            raise InvalidBearerToken from exc

        subject = claims.get("sub")
        email = claims.get("email")
        scopes = claims.get("scope")
        if (
            not isinstance(subject, str)
            or not subject
            or len(subject) > 255
            or not isinstance(email, str)
            or not email
            or len(email) > 320
            or claims.get("email_verified") is not True
            or not isinstance(scopes, str)
        ):
            raise InvalidBearerToken

        return VerifiedIdentity(
            issuer=self.issuer,
            subject=subject,
            email=email,
            scopes=frozenset(scopes.split()),
        )


def create_oidc_verifier(settings: Settings) -> OIDCBearerVerifier | None:
    if not (settings.oidc_issuer and settings.oidc_audience and settings.oidc_jwks_url):
        return None
    from jwt import PyJWKClient

    return OIDCBearerVerifier(
        issuer=settings.oidc_issuer,
        audience=settings.oidc_audience,
        algorithms=settings.oidc_allowed_algorithms,
        jwks_provider=PyJWKClient(
            settings.oidc_jwks_url,
            timeout=settings.oidc_jwks_timeout_seconds,
            cache_jwk_set=True,
        ),
    )


def _unauthenticated() -> ApplicationError:
    return ApplicationError(
        ErrorCode.UNAUTHENTICATED,
        "A valid bearer token is required.",
        401,
    )


def _parse_bearer(authorization: str | None) -> str:
    if authorization is None:
        raise _unauthenticated()
    scheme, separator, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not separator or not token or token.strip() != token:
        raise _unauthenticated()
    if any(character.isspace() for character in token):
        raise _unauthenticated()
    if len(token) > 16_384:
        raise _unauthenticated()
    return token


def _identity_from_dev_token(settings: Settings, token: str) -> VerifiedIdentity:
    configured_token = settings.dev_auth_token
    if not settings.dev_auth_enabled or configured_token is None:
        raise _unauthenticated()
    if not secrets.compare_digest(token, configured_token):
        raise _unauthenticated()
    assert settings.dev_auth_email is not None
    return VerifiedIdentity(
        issuer=LOCAL_DEV_ISSUER,
        subject=settings.dev_auth_subject,
        email=settings.dev_auth_email,
        scopes=frozenset({"repositories:read", "repositories:write"}),
    )


def resolve_current_user(session: Session, identity: VerifiedIdentity) -> User:
    statement = select(User).where(
        User.auth_issuer == identity.issuer,
        User.auth_subject == identity.subject,
    )
    user = session.scalar(statement)
    if user is not None:
        return user

    user = User(
        email=identity.email,
        auth_issuer=identity.issuer,
        auth_subject=identity.subject,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        # Resolve a concurrent insert by immutable identity only. Never link by email.
        user = session.scalar(statement)
        if user is not None:
            return user
        raise _unauthenticated() from exc
    session.refresh(user)
    return user


async def get_verified_identity(
    request: Request,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> VerifiedIdentity:
    token = _parse_bearer(authorization)
    settings: Settings = request.app.state.settings
    if settings.dev_auth_enabled:
        return _identity_from_dev_token(settings, token)
    verifier: OIDCBearerVerifier | None = request.app.state.oidc_verifier
    if verifier is None:
        raise ApplicationError(
            ErrorCode.INTERNAL_ERROR,
            "Authentication is not configured.",
            503,
            retryable=True,
        )
    try:
        return verifier.verify(token)
    except InvalidBearerToken as exc:
        raise _unauthenticated() from exc
    except AuthenticationProviderUnavailable as exc:
        raise ApplicationError(
            ErrorCode.INTERNAL_ERROR,
            "The authentication provider is temporarily unavailable.",
            503,
            retryable=True,
        ) from exc


def get_current_user(
    identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
    session: Annotated[Session, Depends(get_db_session)],
) -> User:
    """Resolve the authenticated user by immutable OIDC issuer and subject."""
    return resolve_current_user(session, identity)


def require_scopes(*required_scopes: str) -> Callable[..., Awaitable[VerifiedIdentity]]:
    async def dependency(
        identity: Annotated[VerifiedIdentity, Depends(get_verified_identity)],
    ) -> VerifiedIdentity:
        if not set(required_scopes).issubset(identity.scopes):
            raise ApplicationError(
                ErrorCode.FORBIDDEN,
                "This request is not permitted.",
                403,
            )
        return identity

    return dependency
