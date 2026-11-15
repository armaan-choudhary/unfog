from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator, Iterator
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from httpx2 import ASGITransport, AsyncClient, Response
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.resources import JobResponse
from app.core.auth import (
    LOCAL_DEV_ISSUER,
    InvalidBearerToken,
    OIDCBearerVerifier,
)
from app.core.config import Settings, SettingsError
from app.core.errors import ErrorEnvelope
from app.db.base import Base
from app.db.models import Job, Repository, Snapshot, User
from app.db.session import get_db_session
from app.main import create_app

ISSUER = "https://identity.example.test/"
AUDIENCE = "unfog-api"
TEST_SIGNER = Ed25519PrivateKey.from_private_bytes(bytes(range(32)))
OTHER_SIGNER = Ed25519PrivateKey.from_private_bytes(bytes(range(1, 33)))


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _public_jwk(signer: Ed25519PrivateKey = TEST_SIGNER) -> dict[str, str]:
    raw = signer.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": _b64url(raw),
        "use": "sig",
        "alg": "EdDSA",
        "kid": "test-key",
    }


class MockJwksProvider:
    """In-memory JWKS provider that never makes network requests."""

    def __init__(self, jwks: list[dict[str, str]]) -> None:
        self.keys = {key["kid"]: jwt.PyJWK.from_dict(key) for key in jwks}

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        header = jwt.get_unverified_header(token)
        key_id = header.get("kid")
        if not isinstance(key_id, str) or key_id not in self.keys:
            raise jwt.PyJWKClientError("No matching test key.")
        return self.keys[key_id]


def _verifier() -> OIDCBearerVerifier:
    return OIDCBearerVerifier(
        issuer=ISSUER,
        audience=AUDIENCE,
        algorithms=("EdDSA",),
        jwks_provider=MockJwksProvider([_public_jwk()]),
    )


class UnavailableJwksProvider:
    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        del token
        raise jwt.PyJWKClientConnectionError("sensitive provider connection details")


def _token(
    *,
    subject: str = "subject-a",
    email: str = "user-a@example.test",
    issuer: str = ISSUER,
    audience: str | list[str] = AUDIENCE,
    scope: str = "repositories:read",
    expires_at: int = 4_102_444_800,
    email_verified: bool = True,
    signer: Ed25519PrivateKey = TEST_SIGNER,
    algorithm: str = "EdDSA",
) -> str:
    claims = {
        "iss": issuer,
        "aud": audience,
        "sub": subject,
        "email": email,
        "email_verified": email_verified,
        "scope": scope,
        "iat": 1_700_000_000,
        "exp": expires_at,
    }
    return jwt.encode(claims, signer, algorithm=algorithm, headers={"kid": "test-key"})


def _settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": "sqlite+pysqlite:///:memory:",
        "app_env": "test",
        "oidc_issuer": ISSUER,
        "oidc_audience": AUDIENCE,
        "oidc_jwks_url": "https://identity.example.test/keys",
        "oidc_allowed_algorithms": ("EdDSA",),
    }
    values.update(overrides)
    return Settings(**values)


class AuthHarness:
    def __init__(
        self,
        settings: Settings | None = None,
        verifier: OIDCBearerVerifier | None = None,
    ) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _record) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.app = create_app(settings or _settings(), oidc_verifier=verifier or _verifier())

        async def override_session() -> AsyncIterator[Session]:
            with self.factory() as session:
                yield session

        self.app.dependency_overrides[get_db_session] = override_session

    def close(self) -> None:
        self.app.dependency_overrides.clear()
        self.engine.dispose()

    def request(self, method: str, path: str, **kwargs: Any) -> Response:
        async def send() -> Response:
            async with self.app.router.lifespan_context(self.app):
                async with AsyncClient(
                    transport=ASGITransport(app=self.app), base_url="http://testserver"
                ) as client:
                    return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    def add_user(
        self,
        *,
        email: str,
        issuer: str = ISSUER,
        subject: str,
    ) -> User:
        with self.factory() as session:
            user = User(email=email, auth_issuer=issuer, auth_subject=subject)
            session.add(user)
            session.commit()
            return user

    def add_repository(self, owner_id: UUID, name: str) -> tuple[Repository, Snapshot, Job]:
        with self.factory() as session:
            repository = Repository(
                owner_id=owner_id,
                name=name,
                source_kind="git",
                source_uri="https://user:private-token@example.test/repo.git",
            )
            session.add(repository)
            session.flush()
            snapshot = Snapshot(
                repository_id=repository.id,
                revision_kind="git_commit",
                revision_value="a" * 40,
                manifest_hash="sha256:" + "a" * 64,
            )
            session.add(snapshot)
            session.flush()
            job = Job(
                repository_id=repository.id,
                snapshot_id=snapshot.id,
                job_type="snapshot_index",
            )
            session.add(job)
            session.commit()
            return repository, snapshot, job


@pytest.fixture
def harness() -> Iterator[AuthHarness]:
    instance = AuthHarness()
    try:
        yield instance
    finally:
        instance.close()


def _assert_error(response: Response, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status
    envelope = ErrorEnvelope.model_validate(response.json())
    assert envelope.error.code == code
    return response.json()


def test_verifier_accepts_deterministic_signature_and_claims() -> None:
    token = _token()
    identity = _verifier().verify(token)

    assert identity.issuer == ISSUER
    assert identity.subject == "subject-a"
    assert identity.email == "user-a@example.test"
    assert identity.scopes == frozenset({"repositories:read"})


@pytest.mark.parametrize(
    "token",
    [
        _token(signer=OTHER_SIGNER),
        _token(audience="another-api"),
        _token(issuer="https://attacker.example.test/"),
        _token(expires_at=1_700_000_000),
        _token(email_verified=False),
        "not.a.jwt",
    ],
)
def test_verifier_rejects_invalid_signature_claims_and_malformed_tokens(token: str) -> None:
    with pytest.raises(InvalidBearerToken):
        _verifier().verify(token)


def test_verifier_rejects_algorithm_outside_configured_allowlist() -> None:
    token = jwt.encode(
        {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": "subject-a",
            "email": "user-a@example.test",
            "email_verified": True,
            "scope": "repositories:read",
            "iat": 1_700_000_000,
            "exp": 4_102_444_800,
        },
        "t" * 32,
        algorithm="HS256",
        headers={"kid": "test-key"},
    )
    with pytest.raises(InvalidBearerToken):
        _verifier().verify(token)


def test_settings_fail_closed_for_production_and_local_auth() -> None:
    with pytest.raises(SettingsError, match="OIDC configuration"):
        Settings.from_environment({"DATABASE_URL": "sqlite://", "APP_ENV": "production"})

    with pytest.raises(SettingsError, match="only allowed in development"):
        Settings(
            database_url="sqlite://",
            app_env="production",
            dev_auth_enabled=True,
            dev_auth_token="x" * 40,
            dev_auth_email="dev@example.test",
        )

    with pytest.raises(SettingsError, match="UNFOG_DEV_AUTH_TOKEN"):
        Settings(
            database_url="sqlite://",
            dev_auth_enabled=True,
            dev_auth_email="dev@example.test",
        )


def test_missing_malformed_and_invalid_authentication_use_error_envelope(
    harness: AuthHarness,
) -> None:
    repository_owner = harness.add_user(email="owner@example.test", subject="owner")
    repository, _, _ = harness.add_repository(repository_owner.id, "private")

    missing = harness.request("GET", f"/repositories/{repository.id}")
    malformed = harness.request(
        "GET", f"/repositories/{repository.id}", headers={"Authorization": "Basic abc"}
    )
    invalid = harness.request(
        "GET",
        f"/repositories/{repository.id}",
        headers={"Authorization": "Bearer not.a.jwt"},
    )
    oversized = harness.request(
        "GET",
        f"/repositories/{repository.id}",
        headers={"Authorization": f"Bearer {'x' * 16_385}"},
    )

    _assert_error(missing, 401, "unauthenticated")
    assert missing.headers["www-authenticate"] == "Bearer"
    _assert_error(malformed, 401, "unauthenticated")
    _assert_error(invalid, 401, "unauthenticated")
    _assert_error(oversized, 401, "unauthenticated")
    with harness.factory() as session:
        assert session.scalar(select(User).where(User.auth_subject == "not.a.jwt")) is None


def test_wrong_scope_is_forbidden_without_provisioning_user(harness: AuthHarness) -> None:
    response = harness.request(
        "GET",
        f"/repositories/{uuid4()}",
        headers={"Authorization": f"Bearer {_token(scope='profile')}", "X-User-ID": str(uuid4())},
    )

    _assert_error(response, 403, "forbidden")
    with harness.factory() as session:
        assert session.scalar(select(User).where(User.auth_subject == "subject-a")) is None


def test_jwks_provider_outage_returns_safe_retryable_error_envelope() -> None:
    verifier = OIDCBearerVerifier(
        issuer=ISSUER,
        audience=AUDIENCE,
        algorithms=("EdDSA",),
        jwks_provider=UnavailableJwksProvider(),
    )
    harness = AuthHarness(verifier=verifier)
    try:
        response = harness.request(
            "GET", f"/repositories/{uuid4()}", headers={"Authorization": f"Bearer {_token()}"}
        )
        envelope = ErrorEnvelope.model_validate(response.json())
        assert response.status_code == 503
        assert envelope.error.code == "internal_error"
        assert envelope.error.retryable is True
        assert "sensitive provider" not in response.text
    finally:
        harness.close()


def test_owner_can_read_repository_snapshot_and_job_without_source_uri(
    harness: AuthHarness,
) -> None:
    owner = harness.add_user(email="owner@example.test", subject="subject-a")
    repository, snapshot, job = harness.add_repository(owner.id, "private")
    headers = {"Authorization": f"Bearer {_token()}"}

    repository_response = harness.request("GET", f"/repositories/{repository.id}", headers=headers)
    snapshot_response = harness.request(
        "GET", f"/repositories/{repository.id}/snapshots/{snapshot.id}", headers=headers
    )
    job_response = harness.request(
        "GET", f"/repositories/{repository.id}/jobs/{job.id}", headers=headers
    )

    assert repository_response.status_code == 200
    assert repository_response.json()["id"] == str(repository.id)
    assert "source_uri" not in repository_response.json()
    assert "private-token" not in repository_response.text
    assert snapshot_response.status_code == 200
    assert snapshot_response.json()["repository_id"] == str(repository.id)
    assert job_response.status_code == 200
    assert job_response.json()["job_id"] == str(job.id)
    assert job_response.json()["repository_id"] == str(repository.id)
    assert JobResponse.model_validate_json(job_response.text).job_id == job.id


def test_other_user_cannot_read_repository_snapshot_or_job_and_missing_looks_same(
    harness: AuthHarness,
) -> None:
    owner = harness.add_user(email="owner@example.test", subject="subject-a")
    other = harness.add_user(email="other@example.test", subject="subject-b")
    repository, snapshot, job = harness.add_repository(owner.id, "private")
    headers = {"Authorization": f"Bearer {_token(subject='subject-b', email='other@example.test')}"}

    other_responses = [
        harness.request("GET", f"/repositories/{repository.id}", headers=headers),
        harness.request(
            "GET", f"/repositories/{repository.id}/snapshots/{snapshot.id}", headers=headers
        ),
        harness.request("GET", f"/repositories/{repository.id}/jobs/{job.id}", headers=headers),
    ]
    missing_responses = [
        harness.request("GET", f"/repositories/{uuid4()}", headers=headers),
        harness.request("GET", f"/repositories/{uuid4()}/snapshots/{uuid4()}", headers=headers),
        harness.request("GET", f"/repositories/{uuid4()}/jobs/{uuid4()}", headers=headers),
    ]

    assert other.id != owner.id
    for denied, missing in zip(other_responses, missing_responses, strict=True):
        denied_body = _assert_error(denied, 404, "not_found")
        missing_body = _assert_error(missing, 404, "not_found")
        assert denied_body["error"]["message"] == missing_body["error"]["message"]


def test_identity_is_resolved_only_by_issuer_and_subject(harness: AuthHarness) -> None:
    owner = harness.add_user(email="stable@example.test", subject="subject-a")
    token = _token(email="changed@example.test")
    response = harness.request(
        "GET", f"/repositories/{uuid4()}", headers={"Authorization": f"Bearer {token}"}
    )

    _assert_error(response, 404, "not_found")
    with harness.factory() as session:
        users = list(session.scalars(select(User)).all())
        assert len(users) == 1
        assert users[0].id == owner.id
        assert users[0].email == "stable@example.test"


def test_email_collision_does_not_link_oidc_identity(harness: AuthHarness) -> None:
    legacy = User(email="same@example.test")
    with harness.factory() as session:
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id

    response = harness.request(
        "GET",
        f"/repositories/{uuid4()}",
        headers={"Authorization": f"Bearer {_token(email='same@example.test')}"},
    )

    _assert_error(response, 401, "unauthenticated")
    with harness.factory() as session:
        users = list(session.scalars(select(User)).all())
        assert len(users) == 1
        assert users[0].id == legacy_id
        assert users[0].auth_issuer is None


def test_local_auth_requires_secret_and_ignores_impersonation_headers() -> None:
    token = "dev-only-token-" + "x" * 40
    settings = _settings(
        app_env="development",
        oidc_issuer=None,
        oidc_audience=None,
        oidc_jwks_url=None,
        dev_auth_enabled=True,
        dev_auth_token=token,
        dev_auth_email="local@example.test",
        dev_auth_subject="developer-1",
    )
    harness = AuthHarness(settings)
    try:
        configured_user = harness.add_user(
            email="local@example.test",
            issuer=LOCAL_DEV_ISSUER,
            subject="developer-1",
        )
        repository, _, _ = harness.add_repository(configured_user.id, "local")
        unauthenticated = harness.request(
            "GET",
            f"/repositories/{repository.id}",
            headers={"X-User-ID": str(configured_user.id)},
        )
        authenticated = harness.request(
            "GET",
            f"/repositories/{repository.id}",
            headers={"Authorization": f"Bearer {token}", "X-User-ID": str(uuid4())},
        )
        _assert_error(unauthenticated, 401, "unauthenticated")
        assert authenticated.status_code == 200
        assert authenticated.json()["id"] == str(repository.id)
    finally:
        harness.close()


def test_token_and_identity_values_are_not_logged(
    harness: AuthHarness, capsys: pytest.CaptureFixture[str]
) -> None:
    token = _token()
    harness.request("GET", f"/repositories/{uuid4()}", headers={"Authorization": f"Bearer {token}"})
    logs = capsys.readouterr().err
    assert token not in logs
    assert "subject-a" not in logs
    assert "user-a@example.test" not in logs
