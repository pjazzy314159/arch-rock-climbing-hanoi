"""Tests for the database connection configuration."""

from __future__ import annotations

from app.db import connection_args_for


def test_sqlite_uses_the_thread_pool_compatible_argument() -> None:
    assert connection_args_for("sqlite:///./arch_dev.db") == {"check_same_thread": False}


def test_postgresql_connection_attempts_are_bounded() -> None:
    assert connection_args_for("postgresql+psycopg://user:pass@localhost:5432/arch") == {
        "connect_timeout": 5
    }
    assert connection_args_for("postgresql://user:pass@localhost:5432/arch") == {
        "connect_timeout": 5
    }
