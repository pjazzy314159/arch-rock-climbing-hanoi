"""The member dashboard response.

Everything here is read from the signed-in member's own rows, or from the
gym's own route list. Nothing is estimated, and a value that is not
available is ``null`` rather than zero: a member who has never climbed has no
best grade, not a best grade of ``V0``, and is not on the leaderboard, not at
rank zero.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.models import ResultType


class OutcomeCounts(BaseModel):
    """How the member's logged climbs break down.

    ``flashes`` is a **subset** of ``sends``: a flash is a send that was
    climbed on the first attempt. It is not a third outcome, and the two are
    never added together.
    """

    #: Every logged send.
    sends: int = 0
    #: The sends that were climbed on the first attempt.
    flashes: int = 0
    #: The logged climbs that are still projects.
    projects: int = 0
    #: Every attempt, over every logged climb.
    attempts: int = 0


class GradeStat(BaseModel):
    """One grade in the member's own record."""

    grade: str
    sends: int = 0
    flashes: int = 0
    projects: int = 0


class RankingInfo(BaseModel):
    """Where the member stands.

    The scoring rule is the leaderboard's own and is not changed here: sends
    only, one point per grade step (V0 = 1), ties broken by number of sends,
    then best grade, then the date of the first send. A climber with no sends
    is not ranked.
    """

    #: The competition rank (1, 1, 3, …). ``None`` when the member is not ranked.
    rank: int | None = None
    #: How many climbers are ranked at all.
    ranked_count: int = 0
    #: How many of them are strictly ahead of the member.
    ahead: int = 0
    #: The share of ranked climbers who are at or behind the member's position,
    #: as a whole percentage. ``None`` when the member is not ranked.
    percentile: int | None = None
    #: The member's own score, under the leaderboard's rule.
    score: int = 0
    total_sends: int = 0
    best_grade: str | None = None
    #: The scoring rule in words, as the backend applies it. It is sent with
    #: the ranking so the page cannot state a different rule from the one the
    #: numbers were worked out with.
    scoring_rule: str
    #: How the percentile is worked out, in words.
    percentile_rule: str


class RecentAttempt(BaseModel):
    """One of the member's most recent logged climbs."""

    id: int
    route_id: int | None = None
    route_name: str
    grade: str
    result: ResultType
    attempts: int
    climbed_on: date
    #: True when the climb was a send on the first attempt.
    is_flash: bool = False


class DashboardOut(BaseModel):
    """Everything the member dashboard shows."""

    #: How many routes are on the wall at the gym right now.
    active_routes: int = 0

    #: The member's own record.
    total_sends: int = 0
    total_sessions: int = 0
    best_grade: str | None = None
    active_projects: int = 0
    outcomes: OutcomeCounts = Field(default_factory=OutcomeCounts)
    by_grade: list[GradeStat] = Field(default_factory=list)
    ranking: RankingInfo
    recent_attempts: list[RecentAttempt] = Field(default_factory=list)

    #: False for a member who has never logged a climb. The interface uses it
    #: to show an empty state rather than a page of zeroes.
    has_activity: bool = False
    #: The day of the member's first logged climb, if there is one.
    first_climb: date | None = None
    #: The day of the member's most recent logged climb, if there is one.
    last_climb: date | None = None
    agreement_status: str | None = None
