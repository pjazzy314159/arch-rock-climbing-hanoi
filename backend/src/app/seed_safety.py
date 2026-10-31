"""Fail-closed safety checks for the ARCH seed command.

The seed command can create or rewrite data, so it must never be pointed at a
production or shared database by accident. These checks deliberately fail
closed: an unrecognised environment, host, database name, scheme, or SQLite
path is refused before Alembic or any content code runs.

This is a command-line safety boundary, not an authentication mechanism. It
does not connect to the target to prove its identity; it validates the
configured SQLAlchemy URL against an explicit local-development allowlist.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

from app.config import BACKEND_ROOT, REPO_ROOT, is_production

#: Environment names that may run the seed command.
LOCAL_SEED_ENVIRONMENTS = {"development", "dev", "test", "testing", "local"}

#: Hosts that mean the local machine. Numeric addresses are checked with
#: ``ipaddress`` so the whole loopback range is covered.
LOOPBACK_HOSTNAMES = {"localhost"}

#: Database names that are explicitly part of the local ARCH development setup.
#: Examples in the repository docs: arch_dev_pg, arch_dev_pg_test,
#: arch_dev_pg_restore_check, arch_pg_migration_verify.
LOCAL_POSTGRES_DATABASE = re.compile(r"^arch_(dev|test|pg)(?:_|$)")

#: SQLite files must be recognisable database files in the repository's
#: documented local storage locations.
SQLITE_SUFFIXES = {".db", ".sqlite", ".sqlite3"}
SQLITE_ALLOWED_ROOTS = (BACKEND_ROOT / "var", REPO_ROOT / "var")
SQLITE_ALLOWED_EXACT = (BACKEND_ROOT / "arch_dev.db",)


class SeedSafetyError(RuntimeError):
    """Raised when a seed invocation is not safe to run."""


@dataclass(frozen=True)
class SeedTarget:
    """A sanitised description of a validated seed target."""

    backend: str
    description: str


def _normalise_query(url: URL) -> dict[str, str]:
    query: dict[str, str] = {}
    for key, value in url.query.items():
        query[str(key).lower()] = str(value)
    return query


def _is_loopback_host(host: str) -> bool:
    candidate = host.strip().lower()
    if candidate in LOOPBACK_HOSTNAMES:
        return True
    try:
        return ipaddress.ip_address(candidate).is_loopback
    except ValueError:
        return False


def _resolve_sqlite_path(database: str) -> Path:
    path = Path(database)
    if not path.is_absolute():
        path = Path.cwd() / path
    try:
        return path.resolve()
    except OSError as exc:  # pragma: no cover - platform-specific path failure
        raise SeedSafetyError(
            "Refusing to seed: the SQLite database path cannot be resolved safely."
        ) from exc


def _sqlite_path_is_allowed(path: Path) -> bool:
    if path.suffix.lower() not in SQLITE_SUFFIXES:
        return False
    for allowed in SQLITE_ALLOWED_EXACT:
        if path == allowed.resolve():
            return True
    for root in SQLITE_ALLOWED_ROOTS:
        try:
            path.relative_to(root.resolve())
        except ValueError:
            continue
        return True
    return False


def _validate_sqlite(url: URL) -> SeedTarget:
    database = (url.database or "").strip()
    query = _normalise_query(url)

    # ``sqlite://`` and ``sqlite:///:memory:`` are ephemeral test databases.
    if database in {"", ":memory:"}:
        return SeedTarget("sqlite", "in-memory SQLite database")

    is_uri = query.get("uri", "").lower() in {"1", "true", "yes"}
    if is_uri and database.startswith("file:"):
        database = database[5:]
    elif database.startswith("file:"):
        raise SeedSafetyError(
            "Refusing to seed: a SQLite file URI is ambiguous without uri=true."
        )

    if is_uri and query.get("mode", "").lower() == "memory":
        return SeedTarget("sqlite", "in-memory SQLite database")

    path = _resolve_sqlite_path(database)
    if not _sqlite_path_is_allowed(path):
        raise SeedSafetyError(
            "Refusing to seed: SQLite databases may only live in the documented "
            "local locations (backend/var, var, or backend/arch_dev.db)."
        )
    return SeedTarget("sqlite", f"SQLite database at {path}")


def _validate_postgresql(url: URL) -> SeedTarget:
    host = (url.host or "").strip()
    database = (url.database or "").strip()

    if not host:
        raise SeedSafetyError(
            "Refusing to seed: PostgreSQL target has no explicit loopback host. "
            "Use an explicit local host such as 127.0.0.1."
        )
    if not _is_loopback_host(host):
        raise SeedSafetyError(
            "Refusing to seed: PostgreSQL host is not loopback. Only local "
            "development/test databases may be seeded."
        )
    if not database:
        raise SeedSafetyError("Refusing to seed: PostgreSQL target has no database name.")
    if not LOCAL_POSTGRES_DATABASE.match(database):
        raise SeedSafetyError(
            "Refusing to seed: PostgreSQL database name is not an approved local "
            "ARCH development/test database (expected an arch_dev*, arch_test* "
            "or arch_pg* name)."
        )
    if url.query:
        raise SeedSafetyError(
            "Refusing to seed: PostgreSQL connection query parameters are not "
            "allowed for a local seed target; use a plain local DATABASE_URL."
        )
    return SeedTarget(
        "postgresql",
        f"PostgreSQL database {database!r} on loopback host {host!r}",
    )


def validate_database_target(database_url: str) -> SeedTarget:
    """Validate a SQLAlchemy URL without connecting to the target."""
    if not database_url or not database_url.strip():
        raise SeedSafetyError("Refusing to seed: DATABASE_URL is empty.")
    try:
        url = make_url(database_url.strip())
    except (ArgumentError, ValueError) as exc:
        raise SeedSafetyError(
            "Refusing to seed: DATABASE_URL is not a valid SQLAlchemy connection URL."
        ) from exc

    backend = url.get_backend_name().lower()
    if backend == "sqlite":
        return _validate_sqlite(url)
    if backend in {"postgresql", "postgres"}:
        return _validate_postgresql(url)

    raise SeedSafetyError(
        f"Refusing to seed: database backend {backend!r} is not an approved local "
        "development/test backend (SQLite or local PostgreSQL only)."
    )


def validate_seed_invocation(
    *,
    environment: str,
    database_url: str,
    reset: bool = False,
    confirm_reset: bool = False,
) -> SeedTarget:
    """Validate the full seed invocation before any migration or write."""
    normalised_environment = environment.strip().lower()
    if is_production(normalised_environment):
        raise SeedSafetyError(
            "Refusing to seed: ARCH_ENVIRONMENT is a production environment. "
            "The seed command is for local development and tests only."
        )
    if normalised_environment not in LOCAL_SEED_ENVIRONMENTS:
        raise SeedSafetyError(
            "Refusing to seed: environment is not an approved local development "
            "or test environment."
        )
    if reset and not confirm_reset:
        raise SeedSafetyError(
            "Refusing --reset: pass --confirm-reset to confirm destruction of the "
            "local database."
        )
    return validate_database_target(database_url)
