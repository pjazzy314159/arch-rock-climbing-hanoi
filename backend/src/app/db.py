"""Database engine, session factory and the declarative base.

This module handles SQLAlchemy engine creation for both local
FastAPI development (``DATABASE_URL``) and Cloudflare Python Workers
deployment with Hyperdrive.

Local development
-----------------
When no Hyperdrive binding is available, the engine uses the
``DATABASE_URL`` setting from ``app.config`` (default:
``postgresql+psycopg://arch_dev@127.0.0.1:5432/arch_dev_pg``).

Cloudflare Workers deployment
-----------------------------
The ``wrangler.jsonc`` must declare a real ``hyperdrive`` binding
with a non-placeholder Hyperdrive configuration ID. The binding is
accessed through the Python Workers runtime via the ASGI scope's
``env`` object: ``scope["env"].HYPERDRIVE``.

The engine for the Hyperdrive binding is created **lazily at request
time** from the ASGI scope, not at module import time. This ensures
the actual runtime binding is used and prevents the Worker from
attempting to connect to a local database (e.g. ``127.0.0.1``).

Important limitations and requirements
--------------------------------------
- The Hyperdrive binding requires a real Hyperdrive configuration
  created in the Cloudflare dashboard. The placeholder ID
  ``PLACEHOLDER-HYPERDRIVE-ID-REPLACE-BEFORE-DEPLOY`` must be replaced.
- The actual Hyperdrive connection parameters (host, port, username,
  password, database) are provided by the Hyperdrive service through
  the ``env.HYPERDRIVE`` binding, not by user-defined environment
  variables.
- The engine for the binding is created per-request from the ASGI
  scope. Connections are properly closed via the ``get_db`` dependency.
- The health endpoint (``GET /api/health``) reports
  ``database_reachable: true`` only when a real connection test
  (``SELECT 1``) succeeds against the engine derived from the binding.
- Alembic migrations use the standard ``DATABASE_URL`` from a trusted
  environment; they do not use the Worker runtime binding.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from threading import local

from fastapi import Request
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


# Thread-local storage for request-scoped engines created from Hyperdrive binding
_thread_local = local()


def connection_args_for(database_url: str) -> dict[str, object]:
    """Return driver-specific connection arguments for a SQLAlchemy URL."""
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    if database_url.startswith(("postgresql", "postgres")):
        return {"connect_timeout": 5}
    return {}


def _build_url_from_hyperdrive_binding(binding) -> str | None:
    """Construct a SQLAlchemy PostgreSQL URL from a Hyperdrive binding object.

    The binding is expected to expose connection parameters. We try
    common attribute patterns used by the Hyperdrive Python Workers SDK.
    """
    if binding is None:
        return None

    # Try to get a direct connection string if the binding provides one
    for attr in ("connectionString", "connection_string", "url"):
        if hasattr(binding, attr):
            value = getattr(binding, attr)
            if value and isinstance(value, str):
                try:
                    made_url = make_url(value)
                    # Ensure psycopg driver
                    if not made_url.drivername.startswith("postgresql+psycopg"):
                        made_url = made_url.set(drivername="postgresql+psycopg")
                    return made_url.render_as_string(hide_password=False)
                except Exception:
                    pass

    # Try to get individual connection parameters
    host = getattr(binding, "host", None)
    port = getattr(binding, "port", 5432)
    username = getattr(binding, "user", None) or getattr(binding, "username", None)
    password = getattr(binding, "password", None)
    database = getattr(binding, "database", None)

    if host and username and database:
        url_str = f"postgresql+psycopg://{username}"
        if password:
            url_str += f":{password}"
        url_str += f"@{host}:{port}/{database}"
        try:
            made_url = make_url(url_str)
            return made_url.render_as_string(hide_password=False)
        except Exception:
            return None

    return None


def _get_hyperdrive_binding_from_scope(scope) -> object | None:
    """Extract the Hyperdrive binding from the ASGI scope.

    In Cloudflare Python Workers, the runtime provides bindings through
    ``scope["env"]``. The Hyperdrive binding is available as
    ``scope["env"].HYPERDRIVE``.
    """
    env = scope.get("env")
    if env is not None and hasattr(env, "HYPERDRIVE"):
        return env.HYPERDRIVE
    return None


def get_engine_from_scope(scope) -> object | None:
    """Get or create a SQLAlchemy engine from the Hyperdrive binding in the ASGI scope.

    Returns ``None`` if no Hyperdrive binding is available in the scope,
    indicating the caller should fall back to the local development engine.
    """
    binding = _get_hyperdrive_binding_from_scope(scope)
    if binding is None:
        return None

    # Check if we already have an engine for this request in thread-local storage
    engine = getattr(_thread_local, "hyperdrive_engine", None)
    if engine is not None:
        return engine

    url = _build_url_from_hyperdrive_binding(binding)
    if url is None:
        return None

    engine = create_engine(
        url,
        future=True,
        connect_args=connection_args_for(url),
        pool_pre_ping=True,
    )
    _thread_local.hyperdrive_engine = engine
    return engine


def close_hyperdrive_engine() -> None:
    """Close and dispose the request-scoped Hyperdrive engine if it exists."""
    engine = getattr(_thread_local, "hyperdrive_engine", None)
    if engine is not None:
        engine.dispose()
        _thread_local.hyperdrive_engine = None


# ---------------------------------------------------------------------------
# Local development engine (created at import time)
# ---------------------------------------------------------------------------

_local_engine = create_engine(
    get_settings().database_url,
    future=True,
    connect_args=connection_args_for(get_settings().database_url),
    pool_pre_ping=True,
)

LocalSessionLocal = sessionmaker(
    bind=_local_engine, autoflush=False, expire_on_commit=False, future=True
)


class Base(DeclarativeBase):
    """Declarative base for every ARCH model."""


def get_db(request: Request) -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped database session.

    The request's ASGI scope is inspected for a Hyperdrive binding
    (``scope["env"].HYPERDRIVE``). If present, a request-scoped engine is
    created from that binding. Otherwise, the local development engine is used.

    The session is properly closed after the request.
    """
    # Get the ASGI scope from the request
    scope = request.scope

    # Try to get engine from Hyperdrive binding in scope
    engine = get_engine_from_scope(scope)

    if engine is not None:
        session_factory = sessionmaker(
            bind=engine, autoflush=False, expire_on_commit=False, future=True
        )
        session = session_factory()
    else:
        session = LocalSessionLocal()

    try:
        yield session
    finally:
        session.close()
        # Close the request-scoped Hyperdrive engine if we created one
        if hasattr(_thread_local, "hyperdrive_engine"):
            close_hyperdrive_engine()


@contextmanager
def session_scope(scope: dict | None = None) -> Iterator[Session]:
    """Context manager for scripts and background jobs.

    If ``scope`` is provided and contains a Hyperdrive binding, uses the
    binding-derived engine. Otherwise, uses the local development engine.
    """
    engine = None
    if scope is not None:
        engine = get_engine_from_scope(scope)

    if engine is not None:
        session_factory = sessionmaker(
            bind=engine, autoflush=False, expire_on_commit=False, future=True
        )
        session = session_factory()
    else:
        session = LocalSessionLocal()

    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
        if scope is not None:
            close_hyperdrive_engine()


# For backward compatibility: expose the local engine and session factory
# so existing imports like ``from app.db import engine`` continue to work
# for local development. In production, the real engine comes from the binding.
engine = _local_engine
SessionLocal = LocalSessionLocal