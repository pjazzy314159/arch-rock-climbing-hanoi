"""Hold annotations drawn by hand on a wall photograph.

A hold belongs to the *wall*, not to a route: one physical hold can be used by
several routes. A route's ordered selection of holds lives in a hold set, so
staff can build a draft without changing what members already see.

Coordinates are normalised against the photograph itself (``0..1``), never
against the screen. The same annotation therefore lines up at every viewport
size and needs no stored image dimensions.
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import TimestampMixin


class HoldRole(enum.StrEnum):
    """A hold's place in the sequence of a route."""

    START = "start"
    MIDDLE = "middle"
    FINISH = "finish"


class HoldSetStatus(enum.StrEnum):
    """Whether members can see a route's annotated sequence yet."""

    DRAFT = "draft"
    PUBLISHED = "published"
    SUPERSEDED = "superseded"


class WallHold(Base, TimestampMixin):
    """One hand-drawn box on a wall photograph."""

    __tablename__ = "wall_holds"
    __table_args__ = (
        CheckConstraint("x >= 0 AND x < 1", name="ck_wall_holds_x"),
        CheckConstraint("y >= 0 AND y < 1", name="ck_wall_holds_y"),
        CheckConstraint("width > 0 AND width <= 1", name="ck_wall_holds_width"),
        CheckConstraint("height > 0 AND height <= 1", name="ck_wall_holds_height"),
        CheckConstraint("x + width <= 1", name="ck_wall_holds_right_edge"),
        CheckConstraint("y + height <= 1", name="ck_wall_holds_bottom_edge"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    wall_id: Mapped[int] = mapped_column(
        ForeignKey("walls.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    #: Top-left corner and size as a fraction of the photograph (0..1).
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    height: Mapped[float] = mapped_column(Float, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class RouteHoldSet(Base, TimestampMixin):
    """A draft or published ordered sequence of holds for one route."""

    __tablename__ = "route_hold_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[int] = mapped_column(
        ForeignKey("climb_routes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[HoldSetStatus] = mapped_column(
        Enum(HoldSetStatus, native_enum=False, length=20),
        default=HoldSetStatus.DRAFT,
        nullable=False,
        index=True,
    )
    #: The photograph the boxes were drawn on. Kept so a later photograph
    #: replacement can be noticed instead of silently misaligning the overlay.
    wall_image_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    holds: Mapped[list[RouteHold]] = relationship(
        back_populates="hold_set",
        cascade="all, delete-orphan",
        order_by="RouteHold.position",
    )


class RouteHold(Base):
    """One hold in a route's sequence, with its position and role."""

    __tablename__ = "route_holds"
    __table_args__ = (
        UniqueConstraint("set_id", "position", name="uq_route_holds_set_position"),
        UniqueConstraint("set_id", "wall_hold_id", name="uq_route_holds_set_hold"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    set_id: Mapped[int] = mapped_column(
        ForeignKey("route_hold_sets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    wall_hold_id: Mapped[int] = mapped_column(
        ForeignKey("wall_holds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: 1-based order within the route. The first hold is the start, the last is
    #: the finish; the service derives the role from the position.
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[HoldRole] = mapped_column(
        Enum(HoldRole, native_enum=False, length=20), nullable=False
    )

    hold_set: Mapped[RouteHoldSet] = relationship(back_populates="holds")
    wall_hold: Mapped[WallHold] = relationship()
