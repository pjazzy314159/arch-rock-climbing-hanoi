"""Add walls, give routes a wall and a wall type, drop the free-text zone.

The routes used to carry a free-text ``zone`` (the name of the wall). A wall is
now a record of its own, so it can carry the photograph the routes on it are
set against, and each route records the type of its own problem.

The existing zones become walls, and every route is pointed at the wall with
the matching name, so no route is lost.

Revision ID: 9d1c4f8ab207
Revises: 6f911594d8db
Create Date: 2026-10-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9d1c4f8ab207"
down_revision: str | None = "6f911594d8db"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: The walls the gym is known to have, with the type given to the routes that
#: are set on them. The type belongs to the problem, not to the wall, so a
#: mixed wall can hold both a slab and an overhang. The value is the *name* of
#: the enum member, which is what SQLAlchemy writes for a Python enum; the API
#: exposes the lower-case value.
WALLS = [
    ("The Main Wall", "VERTICAL", "The long main face of the gym.", 1),
    ("The Slab", "SLAB", "Low-angle wall for balance and technique.", 2),
    ("The Cave", "OVERHANG", "Steep overhang for power and commitment.", 3),
]


def upgrade() -> None:
    op.create_table(
        "walls",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("image_url", sa.String(length=400), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_walls_name", "walls", ["name"], unique=True)
    op.create_index("ix_walls_is_active", "walls", ["is_active"], unique=False)

    # The wall reference carries a foreign key, which SQLite can only add by
    # recreating the table, so it is done on its own.
    with op.batch_alter_table("climb_routes") as batch:
        batch.add_column(
            sa.Column(
                "wall_id",
                sa.Integer(),
                sa.ForeignKey("walls.id", name="fk_climb_routes_wall_id", ondelete="SET NULL"),
                nullable=True,
            )
        )
    # The column holds the *name* of the enum member, and the default has to be
    # one of those names too: SQLAlchemy only reads back the names it wrote.
    op.add_column(
        "climb_routes",
        sa.Column(
            "wall_type",
            sa.Enum(
                "SLAB",
                "VERTICAL",
                "OVERHANG",
                "ROOF",
                "BOULDER",
                name="walltype",
                native_enum=False,
                length=20,
            ),
            nullable=False,
            server_default="VERTICAL",
        ),
    )
    op.create_index("ix_climb_routes_wall_id", "climb_routes", ["wall_id"], unique=False)
    op.create_index("ix_climb_routes_wall_type", "climb_routes", ["wall_type"], unique=False)

    connection = op.get_bind()

    # A wall for every zone that is already in use, plus the known walls so
    # the gym has a complete list from the start.
    existing_zones = [
        row[0]
        for row in connection.execute(
            sa.text("SELECT DISTINCT zone FROM climb_routes WHERE zone IS NOT NULL")
        ).fetchall()
        if row[0]
    ]
    known = {name for name, _type, _description, _order in WALLS}
    for name in sorted(set(existing_zones) | known):
        if connection.execute(
            sa.text("SELECT id FROM walls WHERE name = :name"), {"name": name}
        ).first():
            continue
        wall_type, description, order = next(
            ((t, d, o) for n, t, d, o in WALLS if n == name),
            ("VERTICAL", "", 99),
        )
        connection.execute(
            sa.text(
                "INSERT INTO walls (name, description, sort_order, is_active, created_at, updated_at) "
                "VALUES (:name, :description, :sort_order, :is_active, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {
                "name": name,
                "description": description,
                "sort_order": order,
                # Pass a real boolean rather than the SQLite integer 1:
                # PostgreSQL rejects an integer expression for a boolean column.
                "is_active": True,
            },
        )

    # Every route is pointed at the wall with the matching name.
    connection.execute(
        sa.text(
            "UPDATE climb_routes SET wall_id = "
            "(SELECT id FROM walls WHERE walls.name = climb_routes.zone)"
        )
    )

    # The routes that were on a known wall take that wall's type.
    for name, wall_type, _description, _order in WALLS:
        connection.execute(
            sa.text(
                "UPDATE climb_routes SET wall_type = :wall_type "
                "WHERE wall_id = (SELECT id FROM walls WHERE name = :name)"
            ),
            {"wall_type": wall_type, "name": name},
        )

    # The zone is replaced by the wall reference, so its index goes first.
    op.drop_index("ix_climb_routes_zone", table_name="climb_routes")
    with op.batch_alter_table("climb_routes") as batch:
        batch.drop_column("zone")


def downgrade() -> None:
    # The zone comes back as it was: a required column. SQLite needs a default
    # to add a required column, so the default is removed again afterwards.
    op.add_column(
        "climb_routes",
        sa.Column("zone", sa.String(length=80), nullable=False, server_default=""),
    )

    connection = op.get_bind()
    # A route that is not on a wall has no zone to go back to, so it gets an
    # empty one rather than a null the column does not allow.
    connection.execute(
        sa.text(
            "UPDATE climb_routes SET zone = COALESCE("
            "(SELECT name FROM walls WHERE walls.id = climb_routes.wall_id), '')"
        )
    )
    op.create_index("ix_climb_routes_zone", "climb_routes", ["zone"], unique=False)

    with op.batch_alter_table("climb_routes") as batch:
        batch.drop_index("ix_climb_routes_wall_type")
        batch.drop_index("ix_climb_routes_wall_id")
        batch.drop_constraint("fk_climb_routes_wall_id", type_="foreignkey")
        batch.drop_column("wall_type")
        batch.drop_column("wall_id")

    with op.batch_alter_table("climb_routes") as batch:
        batch.alter_column(
            "zone", existing_type=sa.String(length=80), server_default=None, nullable=False
        )

    op.drop_index("ix_walls_is_active", table_name="walls")
    op.drop_index("ix_walls_name", table_name="walls")
    op.drop_table("walls")
