"""Add immutable OIDC identity and optional profile email to users.

Revision ID: 0002_user_oidc_identity
Revises: 0001_initial_persistence
Create Date: 2026-11-15
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import context, op

revision: str = "0002_user_oidc_identity"
down_revision: Union[str, None] = "0001_initial_persistence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("email", existing_type=sa.String(length=320), nullable=True)
        batch_op.add_column(sa.Column("auth_issuer", sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column("auth_subject", sa.String(length=255), nullable=True))
        batch_op.create_unique_constraint("uq_users_auth_identity", ["auth_issuer", "auth_subject"])
        batch_op.create_check_constraint(
            "auth_identity_pair",
            "(auth_issuer IS NULL AND auth_subject IS NULL) OR "
            "(auth_issuer IS NOT NULL AND auth_subject IS NOT NULL)",
        )

    dialect = context.get_context().dialect.name
    if dialect == "postgresql":
        op.execute(
            """
            CREATE FUNCTION unfog_reject_user_auth_identity_change() RETURNS trigger AS $$
            BEGIN
                IF (OLD.auth_issuer IS NOT NULL OR OLD.auth_subject IS NOT NULL)
                   AND (NEW.auth_issuer IS DISTINCT FROM OLD.auth_issuer
                        OR NEW.auth_subject IS DISTINCT FROM OLD.auth_subject) THEN
                    RAISE EXCEPTION 'User authentication identity is immutable';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
            """
        )
        op.execute(
            """
            CREATE TRIGGER unfog_users_auth_identity_immutable
            BEFORE UPDATE OF auth_issuer, auth_subject ON users
            FOR EACH ROW EXECUTE FUNCTION unfog_reject_user_auth_identity_change()
            """
        )
    elif dialect == "sqlite":
        op.execute(
            """
            CREATE TRIGGER unfog_users_auth_identity_immutable
            BEFORE UPDATE OF auth_issuer, auth_subject ON users
            WHEN (OLD.auth_issuer IS NOT NULL OR OLD.auth_subject IS NOT NULL)
                 AND (NEW.auth_issuer IS NOT OLD.auth_issuer
                      OR NEW.auth_subject IS NOT OLD.auth_subject)
            BEGIN
                SELECT RAISE(ABORT, 'User authentication identity is immutable');
            END
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    has_email_less_users = bind.execute(
        sa.text("SELECT 1 FROM users WHERE email IS NULL LIMIT 1")
    ).first()
    if has_email_less_users is not None:
        raise RuntimeError(
            "Cannot downgrade OIDC identity while users without email addresses exist."
        )

    dialect = context.get_context().dialect.name
    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS unfog_users_auth_identity_immutable ON users")
        op.execute("DROP FUNCTION IF EXISTS unfog_reject_user_auth_identity_change()")
    elif dialect == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS unfog_users_auth_identity_immutable")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("auth_identity_pair", type_="check")
        batch_op.drop_constraint("uq_users_auth_identity", type_="unique")
        batch_op.drop_column("auth_subject")
        batch_op.drop_column("auth_issuer")
        batch_op.alter_column("email", existing_type=sa.String(length=320), nullable=False)
