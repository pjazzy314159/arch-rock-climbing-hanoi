"""Schemas for climbing routes, votes, achievements and the leaderboard."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import ResultType, RouteStatus, VoteValue
from app.schemas.common import ORMModel


class RouteOut(ORMModel):
    id: int
    name: str
    grade: str
    zone: str
    color: str
    style: str
    setter: str
    status: RouteStatus
    set_at: date | None = None
    beta: str | None = None
    image_url: str | None = None


class RouteSummary(RouteOut):
    """A route plus the aggregate community vote information."""

    sends: int = 0
    vote_count: int = 0
    easier_votes: int = 0
    as_set_votes: int = 0
    harder_votes: int = 0
    perceived_grade: str | None = None
    is_fresh: bool = False


class RouteCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    grade: str = Field(min_length=1, max_length=20)
    zone: str = Field(default="The Main Wall", max_length=80)
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
    zone: str | None = Field(default=None, max_length=80)
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
    rank: int
    user_id: int
    display_name: str
    total_sends: int
    best_grade: str | None
    score: int
    climbing_level: int
