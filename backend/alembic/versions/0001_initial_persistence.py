"""Initial users, repositories, immutable snapshots, and jobs.

Revision ID: 0001_initial_persistence
Revises:
Create Date: 2026-11-15
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import context, op

revision: str = "0001_initial_persistence"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_table(
        "repositories",
        sa.Column("id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("owner_id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_kind", sa.String(length=32), nullable=False),
        sa.Column("source_uri", sa.Text(), nullable=True),
        sa.Column("default_branch", sa.String(length=255), nullable=True),
        sa.Column(
            "privacy_mode",
            sa.String(length=32),
            server_default="local_only",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_kind IN ('git', 'archive', 'local_path')",
            name="ck_repositories_source_kind_values",
        ),
        sa.CheckConstraint(
            "privacy_mode IN ('local_only', 'allow_external_ai')",
            name="ck_repositories_privacy_mode_values",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name="fk_repositories_owner_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_repositories"),
    )
    op.create_index(
        "ix_repositories_owner_created",
        "repositories",
        ["owner_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "snapshots",
        sa.Column("id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("repository_id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("revision_kind", sa.String(length=32), nullable=False),
        sa.Column("revision_value", sa.String(length=256), nullable=False),
        sa.Column("manifest_hash", sa.String(length=71), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("parser_version", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "revision_kind IN ('git_commit', 'content_manifest')",
            name="ck_snapshots_revision_kind_values",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'indexing', 'ready', 'failed')",
            name="ck_snapshots_status_values",
        ),
        sa.ForeignKeyConstraint(
            ["repository_id"],
            ["repositories.id"],
            name="fk_snapshots_repository_id_repositories",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_snapshots"),
        sa.UniqueConstraint(
            "repository_id",
            "revision_kind",
            "revision_value",
            name="uq_snapshots_repository_revision",
        ),
        sa.UniqueConstraint("id", "repository_id", name="uq_snapshots_id_repository"),
    )
    op.create_index(
        "ix_snapshots_repository_created",
        "snapshots",
        ["repository_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("repository_id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=False),
        sa.Column("snapshot_id", sa.Uuid(as_uuid=True, native_uuid=True), nullable=True),
        sa.Column("job_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="queued", nullable=False),
        sa.Column("stage", sa.String(length=32), server_default="RECEIVED", nullable=False),
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "job_type IN ('repository_import', 'snapshot_index', 'analysis', "
            "'journey_generation', 'challenge_generation', 'snapshot_comparison')",
            name="ck_jobs_job_type_values",
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')",
            name="ck_jobs_status_values",
        ),
        sa.CheckConstraint(
            "stage IN ('RECEIVED', 'UNPACKING', 'SCANNING', 'PARSING', "
            "'RESOLVING', 'GRAPH_READY', 'AUTOPSY', 'WORLD_READY', 'COMPLETE')",
            name="ck_jobs_stage_values",
        ),
        sa.CheckConstraint("progress BETWEEN 0 AND 100", name="ck_jobs_progress_range"),
        sa.CheckConstraint("retry_count >= 0", name="ck_jobs_retry_count_nonnegative"),
        sa.CheckConstraint(
            "(status = 'failed' AND error_code IS NOT NULL) OR "
            "(status != 'failed' AND error_code IS NULL)",
            name="ck_jobs_failure_has_safe_error_code",
        ),
        sa.ForeignKeyConstraint(
            ["repository_id"],
            ["repositories.id"],
            name="fk_jobs_repository_id_repositories",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id", "repository_id"],
            ["snapshots.id", "snapshots.repository_id"],
            name="fk_jobs_snapshot_repository",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_jobs"),
    )
    op.create_index("ix_jobs_status_created", "jobs", ["status", "created_at"], unique=False)
    op.create_index(
        "ix_jobs_repository_created", "jobs", ["repository_id", "created_at"], unique=False
    )

    # Immutable snapshot identity is enforced in PostgreSQL as well as by the ORM.
    if context.get_context().dialect.name == "postgresql":
        op.execute(
            """CREATE FUNCTION unfog_reject_snapshot_identity_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.repository_id IS DISTINCT FROM OLD.repository_id
     OR NEW.revision_kind IS DISTINCT FROM OLD.revision_kind
     OR NEW.revision_value IS DISTINCT FROM OLD.revision_value
     OR NEW.manifest_hash IS DISTINCT FROM OLD.manifest_hash THEN
    RAISE EXCEPTION 'snapshot source identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql"""
        )
        op.execute(
            """CREATE TRIGGER trg_snapshots_immutable_identity
BEFORE UPDATE ON snapshots
FOR EACH ROW EXECUTE FUNCTION unfog_reject_snapshot_identity_change()"""
        )


def downgrade() -> None:
    if context.get_context().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_snapshots_immutable_identity ON snapshots")
        op.execute("DROP FUNCTION IF EXISTS unfog_reject_snapshot_identity_change()")
    op.drop_index("ix_jobs_repository_created", table_name="jobs")
    op.drop_index("ix_jobs_status_created", table_name="jobs")
    op.drop_table("jobs")
    op.drop_index("ix_snapshots_repository_created", table_name="snapshots")
    op.drop_table("snapshots")
    op.drop_index("ix_repositories_owner_created", table_name="repositories")
    op.drop_table("repositories")
    op.drop_table("users")
