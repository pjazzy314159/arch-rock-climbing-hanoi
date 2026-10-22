"""Tests for the Alembic migrations.

Every test here runs against a **disposable** SQLite file that is deleted
afterwards. The development database and the database the rest of the suite
uses are never touched.

These tests prove that the schema changes ARCH depends on actually work on a
database that already has data in it — SQLite stands in for PostgreSQL here,
and is not a substitute for it.
"""

from __future__ import annotations

import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models import ClimbRoute, WallType

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = BACKEND_ROOT / "migrations"

#: The revision before the walls change, and the revision that adds the walls.
REVISION_BEFORE_WALLS = "6f911594d8db"
REVISION_WITH_WALLS = "9d1c4f8ab207"


@pytest.fixture
def migration_config(monkeypatch: pytest.MonkeyPatch) -> Iterator[Config]:
    """Point the migrations at a disposable database."""
    path = Path(tempfile.gettempdir()) / "arch_migration_test.db"
    if path.exists():
        path.unlink()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path.as_posix()}")
    # The settings are cached, so the cache has to go for the new URL to be read.
    get_settings.cache_clear()

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(MIGRATIONS))
    yield config

    get_settings.cache_clear()
    if path.exists():
        path.unlink()


def _engine(config: Config):
    """An engine for the disposable database the migrations are pointed at."""
    return sa.create_engine(config.get_main_option("sqlalchemy.url"))


def test_the_migrations_apply_to_an_empty_database(migration_config: Config) -> None:
    command.upgrade(migration_config, "head")

    engine = _engine(migration_config)
    try:
        inspector = sa.inspect(engine)
        tables = set(inspector.get_table_names())
        assert "walls" in tables
        assert "climb_routes" in tables

        columns = {column["name"] for column in inspector.get_columns("climb_routes")}
        assert "wall_id" in columns
        assert "wall_type" in columns
        assert "zone" not in columns
    finally:
        engine.dispose()


def test_the_backfill_keeps_the_existing_routes_and_their_wall(
    migration_config: Config,
) -> None:
    """A route that was set on "The Slab" is still on "The Slab" afterwards."""
    command.upgrade(migration_config, REVISION_BEFORE_WALLS)

    engine = _engine(migration_config)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO climb_routes "
                    "(name, grade, zone, color, style, setter, status, created_at, updated_at) "
                    "VALUES ('Quiet the Mind', 'V3', 'The Slab', 'lime', 'Balance', 'Minh', "
                    "'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO climb_routes "
                    "(name, grade, zone, color, style, setter, status, created_at, updated_at) "
                    "VALUES ('Nightfall', 'V5', 'The Cave', 'coral', 'Power', 'Minh', "
                    "'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
    finally:
        engine.dispose()

    command.upgrade(migration_config, "head")

    engine = _engine(migration_config)
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                sa.text(
                    "SELECT r.name, r.wall_type, r.wall_id, w.name "
                    "FROM climb_routes r LEFT JOIN walls w ON w.id = r.wall_id "
                    "ORDER BY r.name"
                )
            ).fetchall()

        # Both routes survive, and each is on the wall with its old zone name.
        assert [(row[0], row[3]) for row in rows] == [
            ("Nightfall", "The Cave"),
            ("Quiet the Mind", "The Slab"),
        ]
        # The known walls give their routes a type.
        assert {row[0]: row[1] for row in rows} == {
            "Nightfall": "OVERHANG",
            "Quiet the Mind": "SLAB",
        }
        assert all(row[2] is not None for row in rows)
    finally:
        engine.dispose()


def test_an_unknown_zone_becomes_a_wall_of_its_own(migration_config: Config) -> None:
    """A wall that ARCH has not published yet is still kept, not lost."""
    command.upgrade(migration_config, REVISION_BEFORE_WALLS)

    engine = _engine(migration_config)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO climb_routes "
                    "(name, grade, zone, color, style, setter, status, created_at, updated_at) "
                    "VALUES ('Oldie', 'V1', 'Training Area', 'blue', 'Balance', 'Minh', "
                    "'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
    finally:
        engine.dispose()

    command.upgrade(migration_config, "head")

    engine = _engine(migration_config)
    try:
        with engine.connect() as connection:
            wall = connection.execute(
                sa.text("SELECT name FROM walls WHERE name = 'Training Area'")
            ).first()
            route_wall = connection.execute(
                sa.text(
                    "SELECT w.name, r.wall_type FROM climb_routes r "
                    "JOIN walls w ON w.id = r.wall_id WHERE r.name = 'Oldie'"
                )
            ).first()
        assert wall is not None
        # An unknown wall gets the default type rather than a wrong one.
        assert route_wall[0] == "Training Area"
        assert route_wall[1] == "VERTICAL"
    finally:
        engine.dispose()


def test_the_migration_rolls_back_and_applies_again(migration_config: Config) -> None:
    """The upgrade and the downgrade can be repeated without losing a route."""
    command.upgrade(migration_config, REVISION_BEFORE_WALLS)

    engine = _engine(migration_config)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO climb_routes "
                    "(name, grade, zone, color, style, setter, status, created_at, updated_at) "
                    "VALUES ('Quiet the Mind', 'V3', 'The Slab', 'lime', 'Balance', 'Minh', "
                    "'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
    finally:
        engine.dispose()

    command.upgrade(migration_config, "head")
    command.downgrade(migration_config, REVISION_BEFORE_WALLS)

    engine = _engine(migration_config)
    try:
        with engine.connect() as connection:
            inspector = sa.inspect(connection)
            columns = {column["name"] for column in inspector.get_columns("climb_routes")}
            assert "zone" in columns
            assert "wall_id" not in columns
            assert "wall_type" not in columns
            assert "walls" not in inspector.get_table_names()

            row = connection.execute(
                sa.text("SELECT name, zone FROM climb_routes WHERE name = 'Quiet the Mind'")
            ).first()
        # The wall name survives the round trip as the old free-text zone.
        assert row[0] == "Quiet the Mind"
        assert row[1] == "The Slab"

        # The restored column is the required column the previous revision had.
        zone_column = next(
            column for column in inspector.get_columns("climb_routes") if column["name"] == "zone"
        )
        assert zone_column["nullable"] is False
    finally:
        engine.dispose()

    command.upgrade(migration_config, "head")

    engine = _engine(migration_config)
    try:
        with engine.connect() as connection:
            row = connection.execute(
                sa.text(
                    "SELECT w.name, r.wall_type FROM climb_routes r "
                    "JOIN walls w ON w.id = r.wall_id WHERE r.name = 'Quiet the Mind'"
                )
            ).first()
        assert row[0] == "The Slab"
        assert row[1] == "SLAB"
    finally:
        engine.dispose()


def test_the_wall_type_is_stored_as_the_enum_name(migration_config: Config) -> None:
    """The column holds the enum member name, which is what SQLAlchemy writes."""
    command.upgrade(migration_config, "head")

    engine = _engine(migration_config)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO climb_routes "
                    "(name, grade, wall_type, color, style, setter, status, "
                    "created_at, updated_at) "
                    "VALUES ('Roof', 'V4', 'ROOF', 'yellow', 'Power', 'Minh', "
                    "'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
        with engine.connect() as connection:
            stored = connection.execute(
                sa.text("SELECT wall_type FROM climb_routes WHERE name = 'Roof'")
            ).first()
        assert stored[0] == "ROOF"
    finally:
        engine.dispose()


def test_a_route_written_without_a_wall_type_can_still_be_read(
    migration_config: Config,
) -> None:
    """The database default has to be a value the ORM understands.

    SQLAlchemy stores the enum *name* and only recognises those names when it
    reads a row back. A row inserted without a wall type takes the column's
    default, so that default has to be the name as well.
    """
    command.upgrade(migration_config, "head")

    engine = _engine(migration_config)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO climb_routes "
                    "(name, grade, color, style, setter, status, created_at, updated_at) "
                    "VALUES ('No Type', 'V2', 'blue', 'Balance', 'Minh', "
                    "'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )

        with engine.connect() as connection:
            stored = connection.execute(
                sa.text("SELECT wall_type FROM climb_routes WHERE name = 'No Type'")
            ).first()
        assert stored[0] == "VERTICAL"

        # The ORM reads the same row back without complaining.
        session = sessionmaker(bind=engine)()
        try:
            route = session.query(ClimbRoute).filter_by(name="No Type").one()
            assert route.wall_type is WallType.VERTICAL
        finally:
            session.close()
    finally:
        engine.dispose()
