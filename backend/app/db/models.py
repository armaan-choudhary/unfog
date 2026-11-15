from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Connection,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    event,
    func,
    inspect,
)
from sqlalchemy.orm import Mapped, Mapper, mapped_column

from app.db.base import Base


class UUIDPrimaryKey:
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True, native_uuid=True), primary_key=True, default=uuid4
    )


class CreatedAt:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class User(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("auth_issuer", "auth_subject", name="uq_users_auth_identity"),
        CheckConstraint(
            "(auth_issuer IS NULL AND auth_subject IS NULL) OR "
            "(auth_issuer IS NOT NULL AND auth_subject IS NOT NULL)",
            name="auth_identity_pair",
        ),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    auth_issuer: Mapped[str | None] = mapped_column(String(512), nullable=True)
    auth_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Repository(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "repositories"
    __table_args__ = (
        CheckConstraint(
            "source_kind IN ('git', 'archive', 'local_path')",
            name="source_kind_values",
        ),
        CheckConstraint(
            "privacy_mode IN ('local_only', 'allow_external_ai')",
            name="privacy_mode_values",
        ),
        Index("ix_repositories_owner_created", "owner_id", "created_at"),
    )

    owner_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True, native_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    # Must be a credential-free locator. Import and redaction logic is a later ticket.
    source_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    privacy_mode: Mapped[str] = mapped_column(
        String(32), nullable=False, default="local_only", server_default="local_only"
    )


class Snapshot(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "snapshots"
    __table_args__ = (
        UniqueConstraint(
            "repository_id",
            "revision_kind",
            "revision_value",
            name="uq_snapshots_repository_revision",
        ),
        UniqueConstraint("id", "repository_id", name="uq_snapshots_id_repository"),
        CheckConstraint(
            "revision_kind IN ('git_commit', 'content_manifest')",
            name="revision_kind_values",
        ),
        CheckConstraint(
            "status IN ('pending', 'indexing', 'ready', 'failed')",
            name="status_values",
        ),
        Index("ix_snapshots_repository_created", "repository_id", "created_at"),
    )

    repository_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True, native_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    revision_value: Mapped[str] = mapped_column(String(256), nullable=False)
    manifest_hash: Mapped[str] = mapped_column(String(71), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending", server_default="pending"
    )
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parser_version: Mapped[str | None] = mapped_column(String(128), nullable=True)


class Job(UUIDPrimaryKey, CreatedAt, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["snapshot_id", "repository_id"],
            ["snapshots.id", "snapshots.repository_id"],
            name="fk_jobs_snapshot_repository",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        CheckConstraint(
            "job_type IN ('repository_import', 'snapshot_index', 'analysis', "
            "'journey_generation', 'challenge_generation', 'snapshot_comparison')",
            name="job_type_values",
        ),
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')",
            name="status_values",
        ),
        CheckConstraint(
            "stage IN ('RECEIVED', 'UNPACKING', 'SCANNING', 'PARSING', "
            "'RESOLVING', 'GRAPH_READY', 'AUTOPSY', 'WORLD_READY', 'COMPLETE')",
            name="stage_values",
        ),
        CheckConstraint("progress BETWEEN 0 AND 100", name="progress_range"),
        CheckConstraint("retry_count >= 0", name="retry_count_nonnegative"),
        CheckConstraint(
            "(status = 'failed' AND error_code IS NOT NULL) OR "
            "(status != 'failed' AND error_code IS NULL)",
            name="failure_has_safe_error_code",
        ),
        Index("ix_jobs_status_created", "status", "created_at"),
        Index("ix_jobs_repository_created", "repository_id", "created_at"),
    )

    repository_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True, native_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True, native_uuid=True), nullable=True
    )
    job_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="queued", server_default="queued"
    )
    stage: Mapped[str] = mapped_column(
        String(32), nullable=False, default="RECEIVED", server_default="RECEIVED"
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Safe summary only. Never persist raw source or provider exceptions here.
    error_message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


@event.listens_for(Snapshot, "before_update")
def reject_snapshot_identity_change(
    mapper: Mapper[Snapshot], connection: Connection, target: Snapshot
) -> None:
    identity_fields = (
        "repository_id",
        "revision_kind",
        "revision_value",
        "manifest_hash",
    )
    state = inspect(target)
    if any(state.attrs[name].history.has_changes() for name in identity_fields):
        raise ValueError("Snapshot source identity is immutable; create a new snapshot instead")


@event.listens_for(User, "before_update")
def reject_user_auth_identity_change(
    mapper: Mapper[User], connection: Connection, target: User
) -> None:
    """Once assigned, an OIDC identity pair is immutable."""
    state = inspect(target)
    identity_fields = ("auth_issuer", "auth_subject")
    histories = [state.attrs[name].history for name in identity_fields]
    previous_values = [history.deleted[0] if history.deleted else None for history in histories]
    if any(previous_values) and any(history.has_changes() for history in histories):
        raise ValueError("User authentication identity is immutable.")
