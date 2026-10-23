"""Database engine, session factory and the declarative base."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()


def connection_args_for(database_url: str) -> dict[str, object]:
    """Return driver-specific connection arguments for a SQLAlchemy URL."""
    if database_url.startswith("sqlite"):
        # SQLite needs this to be usable from FastAPI's thread pool.
        return {"check_same_thread": False}
    if database_url.startswith(("postgresql", "postgres")):
        # A misconfigured or unreachable server must make the health check
        # report the problem promptly instead of hanging until the pool's
        # default 30-second timeout.
        return {"connect_timeout": 5}
    return {}


engine = create_engine(
    settings.database_url,
    future=True,
    connect_args=connection_args_for(settings.database_url),
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for every ARCH model."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped database session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager for scripts and background jobs."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
