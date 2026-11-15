import os
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be set before opening the database")
    return url


@lru_cache(maxsize=8)
def _engine_for_url(url: str, connect_timeout_seconds: int) -> Engine:
    engine_options: dict[str, object] = {"pool_pre_ping": True}
    if url.startswith(("postgresql://", "postgresql+")):
        engine_options["connect_args"] = {"connect_timeout": connect_timeout_seconds}
        engine_options["pool_timeout"] = connect_timeout_seconds
    return create_engine(url, **engine_options)


def get_engine(database_url: str | None = None, *, connect_timeout_seconds: int = 3) -> Engine:
    """Return the cached engine for an explicit URL or configured DATABASE_URL."""
    url = database_url or _database_url()
    return _engine_for_url(url, connect_timeout_seconds)


@lru_cache(maxsize=1)
def get_session_factory(database_url: str | None = None) -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(database_url), autoflush=False, expire_on_commit=False)


def get_db_session() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
