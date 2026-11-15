import os
import tempfile
import unittest
from pathlib import Path
from uuid import UUID

from alembic.config import Config
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.types import Uuid

from alembic import command
from app.db.base import Base
from app.db.models import Job, Repository, Snapshot, User

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
MANIFEST_HASH = "sha256:" + ("a" * 64)


class PersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _record) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def make_repository(self, email: str = "owner@example.test") -> tuple[User, Repository]:
        user = User(email=email)
        self.session.add(user)
        self.session.flush()
        repository = Repository(
            owner_id=user.id,
            name="fixture",
            source_kind="git",
            source_uri="https://example.test/fixture.git",
        )
        self.session.add(repository)
        self.session.flush()
        return user, repository

    def make_snapshot(self, repository: Repository, revision: str = "a" * 40) -> Snapshot:
        snapshot = Snapshot(
            repository_id=repository.id,
            revision_kind="git_commit",
            revision_value=revision,
            manifest_hash=MANIFEST_HASH,
        )
        self.session.add(snapshot)
        self.session.flush()
        return snapshot

    def test_ids_are_uuidv4_and_created_at_is_database_managed(self) -> None:
        user, repository = self.make_repository()
        snapshot = self.make_snapshot(repository)
        job = Job(repository_id=repository.id, snapshot_id=snapshot.id, job_type="snapshot_index")
        self.session.add(job)
        self.session.flush()

        for entity in (user, repository, snapshot, job):
            self.assertIsInstance(entity.id, UUID)
            self.assertEqual(entity.id.version, 4)
            self.assertIsNotNone(entity.created_at)

    def test_uuid_type_compiles_to_postgres_native_uuid(self) -> None:
        sql_type = Uuid(as_uuid=True, native_uuid=True).compile(dialect=postgresql.dialect())
        self.assertEqual(str(sql_type).upper(), "UUID")

    def test_snapshot_source_identity_cannot_be_changed(self) -> None:
        _, repository = self.make_repository()
        snapshot = self.make_snapshot(repository)
        snapshot.revision_value = "b" * 40
        with self.assertRaisesRegex(ValueError, "identity is immutable"):
            self.session.flush()

    def test_revision_is_unique_within_a_repository(self) -> None:
        _, repository = self.make_repository()
        self.make_snapshot(repository)
        duplicate = Snapshot(
            repository_id=repository.id,
            revision_kind="git_commit",
            revision_value="a" * 40,
            manifest_hash=MANIFEST_HASH,
        )
        self.session.add(duplicate)
        with self.assertRaises(IntegrityError):
            self.session.flush()
        self.session.rollback()

    def test_job_cannot_reference_another_repository_snapshot(self) -> None:
        _, repository_a = self.make_repository("a@example.test")
        _, repository_b = self.make_repository("b@example.test")
        snapshot_a = self.make_snapshot(repository_a)
        job = Job(
            repository_id=repository_b.id,
            snapshot_id=snapshot_a.id,
            job_type="snapshot_index",
        )
        self.session.add(job)
        with self.assertRaises(IntegrityError):
            self.session.flush()
        self.session.rollback()

    def test_migration_upgrades_fresh_sqlite_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "migration.db"
            old_url = os.environ.get("DATABASE_URL")
            os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{database_path}"
            try:
                config = Config(str(BACKEND / "alembic.ini"))
                command.upgrade(config, "head")
                command.check(config)
                migration_engine = create_engine(f"sqlite+pysqlite:///{database_path}")
                try:
                    table_names = set(inspect(migration_engine).get_table_names())
                    self.assertTrue({"users", "repositories", "snapshots", "jobs"} <= table_names)
                    self.assertIn("alembic_version", table_names)
                finally:
                    migration_engine.dispose()
            finally:
                if old_url is None:
                    os.environ.pop("DATABASE_URL", None)
                else:
                    os.environ["DATABASE_URL"] = old_url

    def test_identity_migration_preserves_existing_rows_and_enforces_immutable_pair(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "identity-migration.db"
            database_url = f"sqlite+pysqlite:///{database_path}"
            old_url = os.environ.get("DATABASE_URL")
            os.environ["DATABASE_URL"] = database_url
            config = Config(str(BACKEND / "alembic.ini"))
            try:
                command.upgrade(config, "0001_initial_persistence")
                migration_engine = create_engine(database_url)
                user_id = UUID("f6a0c33e-311e-4ea0-a82c-a16031fa0d85")
                repository_id = UUID("0361a2c3-613c-4776-9df6-2c384c69cafa")
                with migration_engine.begin() as connection:
                    connection.execute(
                        text("INSERT INTO users (id, email) VALUES (:id, :email)"),
                        {"id": user_id.hex, "email": "legacy@example.test"},
                    )
                    connection.execute(
                        text(
                            "INSERT INTO repositories "
                            "(id, owner_id, name, source_kind, privacy_mode) "
                            "VALUES (:id, :owner_id, 'legacy', 'git', 'local_only')"
                        ),
                        {"id": repository_id.hex, "owner_id": user_id.hex},
                    )

                command.upgrade(config, "head")
                with migration_engine.begin() as connection:
                    connection.execute(
                        text(
                            "UPDATE users SET auth_issuer = 'https://issuer.example.test', "
                            "auth_subject = 'immutable-subject' WHERE id = :id"
                        ),
                        {"id": user_id.hex},
                    )
                    with self.assertRaises(IntegrityError):
                        connection.execute(
                            text(
                                "UPDATE users SET auth_subject = 'changed-subject' WHERE id = :id"
                            ),
                            {"id": user_id.hex},
                        )
                    with self.assertRaises(IntegrityError):
                        connection.execute(
                            text(
                                "INSERT INTO users (id, email, auth_issuer) "
                                "VALUES (:id, 'partial@example.test', 'https://issuer.example.test')"
                            ),
                            {"id": UUID("96e9af70-615e-4e55-9b1b-3d8c83179579").hex},
                        )

                email_less_user_id = UUID("bc99f360-cd47-4f32-91a5-20dcd23693c6")
                with migration_engine.begin() as connection:
                    connection.execute(
                        text(
                            "INSERT INTO users (id, auth_issuer, auth_subject) "
                            "VALUES (:id, 'https://issuer.example.test', 'email-less')"
                        ),
                        {"id": email_less_user_id.hex},
                    )

                with self.assertRaisesRegex(RuntimeError, "users without email addresses"):
                    command.downgrade(config, "0001_initial_persistence")
                with migration_engine.begin() as connection:
                    connection.execute(
                        text("DELETE FROM users WHERE id = :id"),
                        {"id": email_less_user_id.hex},
                    )
                command.downgrade(config, "0001_initial_persistence")
                with migration_engine.connect() as connection:
                    self.assertEqual(
                        connection.execute(
                            text("SELECT email FROM users WHERE id = :id"),
                            {"id": user_id.hex},
                        ).scalar_one(),
                        "legacy@example.test",
                    )
                    self.assertEqual(
                        connection.execute(
                            text("SELECT owner_id FROM repositories WHERE id = :id"),
                            {"id": repository_id.hex},
                        ).scalar_one(),
                        user_id.hex,
                    )
                    self.assertNotIn(
                        "auth_issuer",
                        {col["name"] for col in inspect(connection).get_columns("users")},
                    )
                migration_engine.dispose()
            finally:
                if old_url is None:
                    os.environ.pop("DATABASE_URL", None)
                else:
                    os.environ["DATABASE_URL"] = old_url


if __name__ == "__main__":
    unittest.main()
