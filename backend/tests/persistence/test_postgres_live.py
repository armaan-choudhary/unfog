import os
import unittest
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.db.models import Job, Repository, Snapshot, User

DATABASE_URL = os.environ.get("UNFOG_TEST_POSTGRES_URL")
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


@unittest.skipUnless(DATABASE_URL, "set UNFOG_TEST_POSTGRES_URL for live PostgreSQL checks")
class LivePostgresPersistenceTests(unittest.TestCase):
    def test_upgrade_integrity_uuid_types_and_downgrade(self) -> None:
        assert DATABASE_URL is not None
        previous_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = DATABASE_URL
        config = Config(os.path.join(BACKEND, "alembic.ini"))
        engine = create_engine(DATABASE_URL)

        try:
            command.upgrade(config, "head")

            inspector = inspect(engine)
            table_names = set(inspector.get_table_names())
            self.assertTrue({"users", "repositories", "snapshots", "jobs"} <= table_names)
            for table, columns in {
                "users": ("id",),
                "repositories": ("id", "owner_id"),
                "snapshots": ("id", "repository_id"),
                "jobs": ("id", "repository_id", "snapshot_id"),
            }.items():
                types = {column["name"]: column["type"] for column in inspector.get_columns(table)}
                for column in columns:
                    self.assertIsInstance(types[column], PostgresUUID, f"{table}.{column}")

            manifest_hash = "sha256:" + ("a" * 64)
            with Session(engine, expire_on_commit=False) as session:
                owner = User(email=f"{uuid4()}@example.test")
                session.add(owner)
                session.flush()
                repository_a = Repository(
                    owner_id=owner.id,
                    name="integration-a",
                    source_kind="git",
                )
                repository_b = Repository(
                    owner_id=owner.id,
                    name="integration-b",
                    source_kind="git",
                )
                session.add_all([repository_a, repository_b])
                session.flush()
                snapshot = Snapshot(
                    repository_id=repository_a.id,
                    revision_kind="git_commit",
                    revision_value="a" * 40,
                    manifest_hash=manifest_hash,
                )
                session.add(snapshot)
                session.flush()
                valid_job = Job(
                    repository_id=repository_a.id,
                    snapshot_id=snapshot.id,
                    job_type="snapshot_index",
                )
                session.add(valid_job)
                session.commit()
                self.assertEqual(valid_job.id.version, 4)
                self.assertIsNotNone(snapshot.created_at)
                owner_id = owner.id
                repository_a_id = repository_a.id

                session.add(
                    Job(
                        repository_id=repository_b.id,
                        snapshot_id=snapshot.id,
                        job_type="snapshot_index",
                    )
                )
                with self.assertRaises(IntegrityError):
                    session.commit()
                session.rollback()

                session.add(
                    Repository(
                        owner_id=uuid4(),
                        name="invalid-owner",
                        source_kind="git",
                    )
                )
                with self.assertRaises(IntegrityError):
                    session.commit()
                session.rollback()

                session.add(
                    Snapshot(
                        repository_id=repository_a.id,
                        revision_kind="git_commit",
                        revision_value="a" * 40,
                        manifest_hash=manifest_hash,
                    )
                )
                with self.assertRaises(IntegrityError):
                    session.commit()
                session.rollback()

            # Bypass SQLAlchemy's ORM guard and prove PostgreSQL enforces this itself.
            with self.assertRaises(DBAPIError):
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "UPDATE snapshots SET manifest_hash = :hash "
                            "WHERE revision_value = :revision"
                        ),
                        {"hash": "sha256:" + ("b" * 64), "revision": "a" * 40},
                    )

            # Exercise PostgreSQL constraints directly, without ORM validation.
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE users SET auth_issuer = :issuer, auth_subject = :subject "
                        "WHERE id = :id"
                    ),
                    {
                        "issuer": "https://issuer.example.test",
                        "subject": "stable-subject",
                        "id": owner_id,
                    },
                )
            with self.assertRaises(DBAPIError):
                with engine.begin() as connection:
                    connection.execute(
                        text("UPDATE users SET auth_subject = 'changed' WHERE id = :id"),
                        {"id": owner_id},
                    )
            with self.assertRaises(DBAPIError):
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "INSERT INTO users (id, email, auth_issuer) "
                            "VALUES (:id, :email, :issuer)"
                        ),
                        {
                            "id": uuid4(),
                            "email": f"partial-{uuid4()}@example.test",
                            "issuer": "https://issuer.example.test",
                        },
                    )
            with self.assertRaises(DBAPIError):
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "INSERT INTO users (id, email, auth_issuer, auth_subject) "
                            "VALUES (:id, :email, :issuer, :subject)"
                        ),
                        {
                            "id": uuid4(),
                            "email": f"duplicate-{uuid4()}@example.test",
                            "issuer": "https://issuer.example.test",
                            "subject": "stable-subject",
                        },
                    )

            command.downgrade(config, "0001_initial_persistence")
            downgraded = inspect(engine)
            self.assertNotIn(
                "auth_issuer", {column["name"] for column in downgraded.get_columns("users")}
            )
            with engine.connect() as connection:
                self.assertEqual(
                    connection.execute(
                        text("SELECT count(*) FROM repositories WHERE id = :id"),
                        {"id": repository_a_id},
                    ).scalar_one(),
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        text("SELECT count(*) FROM users WHERE id = :id"),
                        {"id": owner_id},
                    ).scalar_one(),
                    1,
                )
            command.upgrade(config, "head")

            command.downgrade(config, "base")
            downgraded = inspect(engine)
            self.assertFalse(
                {"users", "repositories", "snapshots", "jobs"} & set(downgraded.get_table_names())
            )
            with engine.connect() as connection:
                remaining_trigger_functions = connection.execute(
                    text("SELECT count(*) FROM pg_proc WHERE proname = :name"),
                    {"name": "unfog_reject_snapshot_identity_change"},
                ).scalar_one()
                remaining_auth_functions = connection.execute(
                    text("SELECT count(*) FROM pg_proc WHERE proname = :name"),
                    {"name": "unfog_reject_user_auth_identity_change"},
                ).scalar_one()
            self.assertEqual(remaining_trigger_functions, 0)
            self.assertEqual(remaining_auth_functions, 0)
        finally:
            engine.dispose()
            if previous_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_url


if __name__ == "__main__":
    unittest.main()
