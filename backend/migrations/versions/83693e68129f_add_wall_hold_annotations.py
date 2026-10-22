"""Add wall holds, ordered route hold sets and the published pointer.

A hold is a hand-drawn box on a wall photograph, stored in normalised image
space. A route's ordered sequence lives in a hold set, so staff can edit a
draft while members keep seeing the last published sequence.

The migration is additive: new tables and one nullable column. Existing routes
simply have no published annotation until staff draw and publish one.

Revision ID: 83693e68129f
Revises: 9d1c4f8ab207
Create Date: 2026-10-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "83693e68129f"
down_revision: str | None = "9d1c4f8ab207"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "route_hold_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("route_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "DRAFT",
                "PUBLISHED",
                "SUPERSEDED",
                name="holdsetstatus",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("wall_image_url", sa.String(length=400), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["route_id"], ["climb_routes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_route_hold_sets_route_id", "route_hold_sets", ["route_id"])
    op.create_index("ix_route_hold_sets_status", "route_hold_sets", ["status"])

    op.create_table(
        "wall_holds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("wall_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=40), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("height", sa.Float(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("x >= 0 AND x < 1", name="ck_wall_holds_x"),
        sa.CheckConstraint("y >= 0 AND y < 1", name="ck_wall_holds_y"),
        sa.CheckConstraint("width > 0 AND width <= 1", name="ck_wall_holds_width"),
        sa.CheckConstraint("height > 0 AND height <= 1", name="ck_wall_holds_height"),
        sa.CheckConstraint("x + width <= 1", name="ck_wall_holds_right_edge"),
        sa.CheckConstraint("y + height <= 1", name="ck_wall_holds_bottom_edge"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["wall_id"], ["walls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wall_holds_wall_id", "wall_holds", ["wall_id"])

    op.create_table(
        "route_holds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("set_id", sa.Integer(), nullable=False),
        sa.Column("wall_hold_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "START",
                "MIDDLE",
                "FINISH",
                name="holdrole",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["set_id"], ["route_hold_sets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wall_hold_id"], ["wall_holds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("set_id", "position", name="uq_route_holds_set_position"),
        sa.UniqueConstraint("set_id", "wall_hold_id", name="uq_route_holds_set_hold"),
    )
    op.create_index("ix_route_holds_set_id", "route_holds", ["set_id"])
    op.create_index("ix_route_holds_wall_hold_id", "route_holds", ["wall_hold_id"])

    # SQLite can only add a foreign key by recreating the table, so the new
    # nullable pointer is added in batch mode. No existing row changes: every
    # route starts with no published annotation.
    with op.batch_alter_table("climb_routes") as batch:
        batch.add_column(sa.Column("published_hold_set_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_climb_routes_published_hold_set_id",
            "route_hold_sets",
            ["published_hold_set_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("climb_routes") as batch:
        batch.drop_constraint("fk_climb_routes_published_hold_set_id", type_="foreignkey")
        batch.drop_column("published_hold_set_id")

    op.drop_index("ix_route_holds_wall_hold_id", table_name="route_holds")
    op.drop_index("ix_route_holds_set_id", table_name="route_holds")
    op.drop_table("route_holds")
    op.drop_index("ix_wall_holds_wall_id", table_name="wall_holds")
    op.drop_table("wall_holds")
    op.drop_index("ix_route_hold_sets_status", table_name="route_hold_sets")
    op.drop_index("ix_route_hold_sets_route_id", table_name="route_hold_sets")
    op.drop_table("route_hold_sets")
