"""Climbing routes, difficulty votes and climbing achievements."""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import TimestampMixin


class RouteStatus(enum.StrEnum):
    """Lifecycle of a set route."""

    ACTIVE = "active"
    ARCHIVED = "archived"
    PENDING_RESET = "pending_reset"


class VoteValue(enum.StrEnum):
    """How a climber perceived a route relative to its official grade."""

    EASIER = "easier"
    AS_SET = "as_set"
    HARDER = "harder"


class ResultType(enum.StrEnum):
    """Outcome of a logged climb."""

    SENT = "sent"
    PROJECT = "project"


class ClimbRoute(Base, TimestampMixin):
    """A route on the wall, with the grade assigned by the gym."""

    __tablename__ = "climb_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(140), nullable=False, index=True)
    grade: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    zone: Mapped[str] = mapped_column(String(80), default="The Main Wall", index=True)
    color: Mapped[str] = mapped_column(String(20), default="lime")
    style: Mapped[str] = mapped_column(String(120), default="")
    setter: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[RouteStatus] = mapped_column(
        Enum(RouteStatus, native_enum=False, length=20),
        default=RouteStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    set_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    beta: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: A reference to a picture of the route, not the picture itself. The file
    #: lives in the media store, so no large binary ever sits in a database row.
    image_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    votes: Mapped[list[RouteVote]] = relationship(
        back_populates="route", cascade="all, delete-orphan"
    )
    achievements: Mapped[list[Achievement]] = relationship(
        back_populates="route", cascade="all, delete-orphan"
    )


class RouteVote(Base, TimestampMixin):
    """A customer's difficulty feedback for a route.

    One active vote per (route, user). Casting a second vote replaces the
    first, which keeps the "one vote per person per route" rule simple and
    auditable.
    """

    __tablename__ = "route_votes"
    __table_args__ = (UniqueConstraint("route_id", "user_id", name="uq_route_vote_route_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[int] = mapped_column(
        ForeignKey("climb_routes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    value: Mapped[VoteValue] = mapped_column(
        Enum(VoteValue, native_enum=False, length=20), nullable=False
    )
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    voter_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    route: Mapped[ClimbRoute] = relationship(back_populates="votes")
    user: Mapped[User] = relationship(back_populates="votes")  # noqa: F821


class Achievement(Base, TimestampMixin):
    """A logged climb: a send or an in-progress project."""

    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    route_id: Mapped[int | None] = mapped_column(
        ForeignKey("climb_routes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    route_name: Mapped[str] = mapped_column(String(140), nullable=False)
    grade: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    result: Mapped[ResultType] = mapped_column(
        Enum(ResultType, native_enum=False, length=20), default=ResultType.SENT, nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    climbed_on: Mapped[date] = mapped_column(
        Date, default=lambda: date.today(), nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="achievements")  # noqa: F821
    route: Mapped[ClimbRoute | None] = relationship(back_populates="achievements")
