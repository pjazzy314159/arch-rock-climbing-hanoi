"""Opt-in PostgreSQL integration coverage.

The normal suite runs against disposable SQLite databases, because it must stay
fast and must not require a database server. These tests are deliberately
opt-in: they run only when ``ARCH_TEST_POSTGRES_URL`` points at a dedicated
PostgreSQL test or verification database.

Each test works in its own temporary schema and drops that schema afterwards.
The public schema, the development database and any seeded data are never
touched. Run them with:

    $env:ARCH_TEST_POSTGRES_URL = "postgresql+psycopg://.../arch_pg_verify"
    uv run pytest tests/test_postgresql_integration.py -q
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base
from app.models import (
    ClimbRoute,
    HoldRole,
    HoldSetStatus,
    RouteHold,
    RouteHoldSet,
    RouteStatus,
    User,
    Wall,
    WallHold,
    WallType,
)
from app.models.base import utcnow
from app.services.holds import hold_set_state, public_holds

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = BACKEND_ROOT / "migrations"
POSTGRES_URL = os.environ.get("ARCH_TEST_POSTGRES_URL")

pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="set ARCH_TEST_POSTGRES_URL to a dedicated PostgreSQL verify database",
)


def _base_url() -> URL:
    """Return the configured URL, refusing anything that is not clearly disposable."""
    assert POSTGRES_URL is not None
    url = make_url(POSTGRES_URL)
    if url.get_backend_name() != "postgresql":
        pytest.fail("ARCH_TEST_POSTGRES_URL must use a PostgreSQL SQLAlchemy URL")
    if not url.database or not any(marker in url.database.lower() for marker in ("test", "verify")):
        pytest.fail(
            "Refusing to run PostgreSQL integration tests against a database whose "
            "name does not contain 'test' or 'verify'"
        )
    return url


def _schema_url(base: URL, schema: str) -> URL:
    """A URL whose connections resolve unqualified names in ``schema``."""
    return base.update_query_dict({"options": f"-csearch_path={schema}"})


@pytest.fixture
def postgres_schema() -> Iterator[tuple[URL, str]]:
    """A temporary schema on the dedicated verification database."""
    base = _base_url()
    schema = f"arch_test_{uuid.uuid4().hex[:12]}"
    admin_engine = sa.create_engine(base, future=True)
    with admin_engine.begin() as connection:
        connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
    try:
        yield base, schema
    finally:
        with admin_engine.begin() as connection:
            connection.execute(sa.text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()


def _migration_config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(MIGRATIONS))
    return config


def test_the_migrations_apply_and_roll_back_on_postgresql(
    postgres_schema: tuple[URL, str],
) -> None:
    base, schema = postgres_schema
    url = _schema_url(base, schema)
    original_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url.render_as_string(hide_password=False)
    get_settings.cache_clear()
    config = _migration_config()
    engine = sa.create_engine(url, future=True)
    try:
        command.upgrade(config, "head")
        command.check(config)

        with engine.connect() as connection:
            inspector = sa.inspect(connection)
            tables = set(inspector.get_table_names())
            assert {
                "users",
                "walls",
                "climb_routes",
                "wall_holds",
                "route_hold_sets",
                "route_holds",
            } <= tables
            route_columns = {
                column["name"]: column for column in inspector.get_columns("climb_routes")
            }
            assert "published_hold_set_id" in route_columns
            assert "wall_type" in route_columns
            assert "zone" not in route_columns
            assert route_columns["wall_type"]["type"].python_type is str
            wall_columns = {column["name"]: column for column in inspector.get_columns("walls")}
            assert wall_columns["is_active"]["type"].python_type is bool
            version = connection.execute(sa.text("SELECT version_num FROM alembic_version"))
            assert version.scalar_one() == "83693e68129f"

        command.downgrade(config, "base")
        with engine.connect() as connection:
            remaining = set(sa.inspect(connection).get_table_names())
        assert not (remaining & set(Base.metadata.tables))
    finally:
        engine.dispose()
        if original_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = original_url
        get_settings.cache_clear()


def test_the_models_and_constraints_work_on_postgresql(
    postgres_schema: tuple[URL, str],
) -> None:
    base, schema = postgres_schema
    engine = sa.create_engine(_schema_url(base, schema), future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    try:
        with factory() as db:
            user = User(
                email="pg-integration@example.com",
                full_name="PostgreSQL Integration",
                password_hash="not-a-real-password-hash",
                is_active=True,
            )
            wall = Wall(name="PG Integration Wall", sort_order=1)
            route = ClimbRoute(
                name="PG Integration Route",
                grade="V4",
                wall=wall,
                wall_type=WallType.OVERHANG,
                status=RouteStatus.ACTIVE,
            )
            db.add_all([user, wall, route])
            db.flush()
            holds = [
                WallHold(
                    wall_id=wall.id,
                    label=f"Hold {index}",
                    x=0.1 * index,
                    y=0.1,
                    width=0.05,
                    height=0.05,
                )
                for index in range(1, 4)
            ]
            db.add_all(holds)
            db.flush()
            hold_set = RouteHoldSet(
                route_id=route.id,
                status=HoldSetStatus.PUBLISHED,
                published_at=utcnow(),
                holds=[
                    RouteHold(wall_hold=holds[0], position=1, role=HoldRole.START),
                    RouteHold(wall_hold=holds[1], position=2, role=HoldRole.MIDDLE),
                    RouteHold(wall_hold=holds[2], position=3, role=HoldRole.FINISH),
                ],
            )
            db.add(hold_set)
            db.flush()
            route.published_hold_set_id = hold_set.id
            db.commit()

            stored_route = db.get(ClimbRoute, route.id)
            assert stored_route is not None
            assert stored_route.wall_type is WallType.OVERHANG
            assert stored_route.status is RouteStatus.ACTIVE
            assert stored_route.published_hold_set_id == hold_set.id
            stored_set = db.get(RouteHoldSet, hold_set.id)
            assert stored_set is not None
            assert [row.position for row in stored_set.holds] == [1, 2, 3]
            assert [row.role for row in stored_set.holds] == [
                HoldRole.START,
                HoldRole.MIDDLE,
                HoldRole.FINISH,
            ]
            assert stored_set.published_at is not None
            assert stored_set.published_at.tzinfo is not None

            status, wall_type = db.execute(
                sa.text(
                    "SELECT s.status, r.wall_type FROM route_hold_sets s "
                    "JOIN climb_routes r ON r.published_hold_set_id = s.id"
                )
            ).one()
            assert status == "PUBLISHED"
            assert wall_type == "OVERHANG"
            assert (
                db.execute(
                    sa.text("SELECT is_active FROM walls WHERE id = :id"), {"id": wall.id}
                ).scalar_one()
                is True
            )

        # The database itself rejects a box outside the photograph.
        with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO wall_holds "
                    "(wall_id, label, x, y, width, height, created_at, updated_at) "
                    "VALUES (:wall_id, 'invalid', 0.9, 0.1, 0.2, 0.05, now(), now())"
                ),
                {"wall_id": wall.id},
            )

        # The database itself rejects two holds at the same position.
        with pytest.raises(sa.exc.IntegrityError), engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO route_holds (set_id, wall_hold_id, position, role) "
                    "VALUES (:set_id, :wall_hold_id, 1, 'START')"
                ),
                {"set_id": hold_set.id, "wall_hold_id": holds[1].id},
            )

        # The failed writes did not remove or duplicate the valid rows.
        with engine.connect() as connection:
            assert connection.execute(sa.text("SELECT count(*) FROM wall_holds")).scalar_one() == 3
            assert connection.execute(sa.text("SELECT count(*) FROM route_holds")).scalar_one() == 3

        # A newer draft must not replace or leak into the published overlay.
        published_ids = [hold.id for hold in holds]
        with factory() as db:
            draft_holds = [
                WallHold(
                    wall_id=wall.id,
                    label=f"Draft hold {index}",
                    x=0.4 + 0.1 * index,
                    y=0.4,
                    width=0.05,
                    height=0.05,
                )
                for index in range(2)
            ]
            db.add_all(draft_holds)
            db.flush()
            draft_hold_ids = [hold.id for hold in draft_holds]
            draft = RouteHoldSet(
                route_id=route.id,
                status=HoldSetStatus.DRAFT,
                holds=[
                    RouteHold(wall_hold=draft_holds[0], position=1, role=HoldRole.START),
                    RouteHold(wall_hold=draft_holds[1], position=2, role=HoldRole.FINISH),
                ],
            )
            db.add(draft)
            db.commit()

            public = public_holds(db, route.id)
            assert public.published is True
            assert [item.wall_hold_id for item in public.holds] == published_ids
            state = hold_set_state(db, route.id)
            assert state.draft is not None
            assert state.published is not None
            assert [item.wall_hold_id for item in state.draft.holds] == draft_hold_ids
            assert [item.wall_hold_id for item in state.published.holds] == published_ids
    finally:
        engine.dispose()
