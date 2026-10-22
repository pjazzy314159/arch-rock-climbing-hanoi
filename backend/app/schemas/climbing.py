"""Schemas for climbing routes, votes, achievements and the leaderboard."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models import ResultType, RouteStatus, VoteValue, WallType
from app.schemas.common import ORMModel


class WallOut(ORMModel):
    """A wall in the gym."""

    id: int
    name: str
    description: str
    image_url: str | None = None
    sort_order: int
    is_active: bool


class WallCreateIn(BaseModel):
    """The body for adding a wall to the gym."""

    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    image_url: str | None = Field(default=None, max_length=400)
    sort_order: int = Field(default=0, ge=0, le=999)
    is_active: bool = True


class RouteOut(ORMModel):
    id: int
    name: str
    grade: str
    #: The wall the route is set on. Empty when the route is not linked to one.
    wall: str = ""
    wall_id: int | None = None
    wall_type: WallType = WallType.VERTICAL
    color: str
    style: str
    setter: str
    status: RouteStatus
    set_at: date | None = None
    beta: str | None = None
    image_url: str | None = None

    @field_validator("wall", mode="before")
    @classmethod
    def _wall_name(cls, value: object) -> str:
        """Accept either the wall's name or the wall itself.

        The model exposes ``wall`` as a relationship, so the response takes the
        name from it rather than the object.
        """
        if value is None:
            return ""
        name = getattr(value, "name", None)
        if isinstance(name, str):
            return name
        return str(value)


class RouteSummary(RouteOut):
    """A route plus the aggregate community vote information."""

    sends: int = 0
    vote_count: int = 0
    easier_votes: int = 0
    as_set_votes: int = 0
    harder_votes: int = 0
    perceived_grade: str | None = None
    is_fresh: bool = False


class WallFilterOption(BaseModel):
    """A wall the route directory can be filtered by."""

    id: int
    name: str
    image_url: str | None = None


class RouteFilterOptions(BaseModel):
    """The values the route directory can be filtered by.

    They come from the routes that exist, so the interface never offers a
    filter the gym does not actually use. A combination of filters may still
    have no routes behind it; that is an empty result, not an error.
    """

    grades: list[str] = Field(default_factory=list)
    walls: list[WallFilterOption] = Field(default_factory=list)
    wall_types: list[WallType] = Field(default_factory=list)
    statuses: list[RouteStatus] = Field(default_factory=list)


class RouteCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    grade: str = Field(min_length=1, max_length=20)
    wall_id: int | None = None
    wall_type: WallType = WallType.VERTICAL
    color: str = Field(default="lime", max_length=20)
    style: str = Field(default="", max_length=120)
    setter: str = Field(default="", max_length=80)
    set_at: date | None = None
    beta: str | None = Field(default=None, max_length=4000)
    image_url: str | None = Field(default=None, max_length=400)
    status: RouteStatus = RouteStatus.ACTIVE


class RouteUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    grade: str | None = Field(default=None, min_length=1, max_length=20)
    wall_id: int | None = None
    wall_type: WallType | None = None
    color: str | None = Field(default=None, max_length=20)
    style: str | None = Field(default=None, max_length=120)
    setter: str | None = Field(default=None, max_length=80)
    set_at: date | None = None
    beta: str | None = Field(default=None, max_length=4000)
    image_url: str | None = Field(default=None, max_length=400)
    status: RouteStatus | None = None


class VoteIn(BaseModel):
    value: VoteValue
    comment: str | None = Field(default=None, max_length=1000)
    climber_level: int | None = Field(default=None, ge=0, le=12)


class VoteOut(ORMModel):
    id: int
    route_id: int
    value: VoteValue
    comment: str | None = None
    created_at: datetime


class VoteTally(BaseModel):
    route_id: int
    total: int
    easier: int
    as_set: int
    harder: int
    perceived_grade: str | None = None
    official_grade: str


class AchievementIn(BaseModel):
    route_id: int | None = None
    route_name: str = Field(min_length=1, max_length=140)
    grade: str = Field(min_length=1, max_length=20)
    result: ResultType = ResultType.SENT
    attempts: int = Field(default=1, ge=1, le=500)
    climbed_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class AchievementOut(ORMModel):
    id: int
    route_id: int | None = None
    route_name: str
    grade: str
    result: ResultType
    attempts: int
    climbed_on: date
    notes: str | None = None
    created_at: datetime


class LeaderboardEntry(BaseModel):
    """A climber's place on the public leaderboard.

    Only what the page shows is published. The internal user id is not
    included, and neither is the climber's self-reported level, because the
    brief asks not to publish personal information on a public leaderboard
    until ARCH has confirmed that it belongs there.
    """

    rank: int
    display_name: str
    total_sends: int
    best_grade: str | None
    score: int
