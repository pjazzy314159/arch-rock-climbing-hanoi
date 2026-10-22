"""Inspect the database the application is actually pointed at.

Usage::

    uv run python scripts/inspect_database.py

The script uses the configured ``DATABASE_URL``, so it works against SQLite
and PostgreSQL alike, and it never writes anything. It answers the questions
that come up when a schema change is in flight:

* which tables exist, and what the route table looks like now;
* which walls are in the gym;
* how the enum columns are stored on disk, and whether the ORM can read them
  back — the raw value and the value the application sees are printed side by
  side, because a mismatch between them is invisible until a query fails.
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, select, text

from app.db import SessionLocal, engine
from app.models import ClimbRoute, Wall


def _print_tables() -> None:
    inspector = inspect(engine)
    tables = sorted(inspector.get_table_names())
    print("tables:")
    for table in tables:
        print(f"  {table}")


def _print_columns(table: str) -> None:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        print(f"{table}: no such table")
        return
    print(f"{table} columns:")
    for column in inspector.get_columns(table):
        nullable = "nullable" if column["nullable"] else "required"
        print(f"  {column['name']} ({column['type']}, {nullable})")


def _print_walls() -> None:
    with SessionLocal() as session:
        walls = session.scalars(select(Wall).order_by(Wall.sort_order, Wall.id)).all()
    if not walls:
        print("walls: none")
        return
    print("walls:")
    for wall in walls:
        print(
            f"  {wall.id}: {wall.name} "
            f"(order {wall.sort_order}, active {wall.is_active}, "
            f"photo {wall.image_url or 'none'})"
        )


def _print_enum_storage() -> None:
    """Show the stored value and the value the ORM reads for the same row."""
    with SessionLocal() as session:
        routes = session.scalars(select(ClimbRoute).order_by(ClimbRoute.id)).all()
        if not routes:
            print("routes: none")
            return

        ids = ", ".join(str(route.id) for route in routes)
        with engine.connect() as connection:
            raw = connection.execute(
                text(f"SELECT id, status, wall_type FROM climb_routes WHERE id IN ({ids})")
            ).fetchall()
        raw_by_id = {row[0]: (row[1], row[2]) for row in raw}

        print("routes (raw storage vs the value the application sees):")
        for route in routes:
            stored_status, stored_wall_type = raw_by_id.get(route.id, ("?", "?"))
            print(
                f"  id={route.id} {route.name!r}: "
                f"stored status={stored_status!r} wall_type={stored_wall_type!r} | "
                f"read status={route.status!r} wall_type={route.wall_type!r}"
            )


def main() -> int:
    print(f"database: {engine.url.render_as_string(hide_password=True)}")
    _print_tables()
    _print_columns("climb_routes")
    _print_columns("walls")
    _print_walls()
    _print_enum_storage()
    return 0


if __name__ == "__main__":
    sys.exit(main())
