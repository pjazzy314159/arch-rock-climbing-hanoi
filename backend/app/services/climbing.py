"""Climbing business rules: grade arithmetic, vote tallies and the leaderboard.

These rules are deliberately explicit and unit-tested so that the displayed
grade and the ranking are reproducible and auditable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from app.models import Achievement, ResultType, RouteStatus, VoteValue

#: A route needs at least this many community votes before a perceived grade
#: is published. Below the threshold the official grade is shown on its own.
MIN_VOTES_FOR_PERCEIVED_GRADE = 3

#: The community may shift the displayed grade by at most this many steps.
MAX_GRADE_SHIFT = 1

#: Score awarded for one send, based on the grade index (V0 -> 1, V1 -> 2, ...).
BASE_SCORE_PER_SEND = 1

_GRADE_PATTERN = re.compile(r"^\s*V\s*(\d{1,2})\s*$", re.IGNORECASE)


def grade_to_index(grade: str) -> int | None:
    """Convert a boulder grade such as ``"V3"`` into its numeric index.

    Returns ``None`` when the grade is not a recognised V-scale grade.
    """
    if not grade:
        return None
    match = _GRADE_PATTERN.match(grade)
    if not match:
        return None
    return int(match.group(1))


def index_to_grade(index: int) -> str:
    """Convert a numeric grade index back into its ``V<n>`` representation."""
    return f"V{max(0, index)}"


@dataclass
class VoteTallyResult:
    """Aggregated community feedback for a single route."""

    route_id: int
    official_grade: str
    total: int = 0
    easier: int = 0
    as_set: int = 0
    harder: int = 0
    perceived_grade: str | None = None

    @property
    def shift(self) -> int:
        """Grade shift in whole steps, derived from the vote distribution."""
        if self.total < MIN_VOTES_FOR_PERCEIVED_GRADE:
            return 0
        net = (self.harder - self.easier) / self.total
        if net >= 0.5:
            step = 1
        elif net <= -0.5:
            step = -1
        else:
            step = 0
        return max(-MAX_GRADE_SHIFT, min(MAX_GRADE_SHIFT, step))


def tally_votes(route_id: int, official_grade: str, votes: list[VoteValue]) -> VoteTallyResult:
    """Aggregate raw votes into a tally and derive the perceived grade.

    Rules:

    * ``easier`` votes pull the displayed grade down, ``harder`` votes push it up.
    * A shift only happens when at least half of the votes point the same way.
    * The shift is at most one grade step either way.
    * The gym's official grade is never modified; the perceived grade is shown
      alongside it.
    """
    result = VoteTallyResult(route_id=route_id, official_grade=official_grade)
    for value in votes:
        result.total += 1
        if value is VoteValue.EASIER:
            result.easier += 1
        elif value is VoteValue.HARDER:
            result.harder += 1
        else:
            result.as_set += 1

    if result.total >= MIN_VOTES_FOR_PERCEIVED_GRADE:
        base_index = grade_to_index(official_grade)
        if base_index is not None:
            result.perceived_grade = index_to_grade(base_index + result.shift)
    return result


@dataclass
class LeaderboardRow:
    """One climber's aggregated climbing record."""

    user_id: int
    display_name: str
    total_sends: int = 0
    best_grade: str | None = None
    best_grade_index: int = -1
    score: int = 0
    climbing_level: int = 0
    first_send_on: date | None = None
    sent_grade_indices: list[int] = field(default_factory=list)


def build_leaderboard(
    users: list[tuple[int, str, int]], achievements: list[Achievement]
) -> list[LeaderboardRow]:
    """Build the leaderboard from user records and logged climbs.

    Scoring rules:

    * Only ``sent`` results count towards the leaderboard; projects do not.
    * One send is worth ``grade index + 1`` points, so harder sends score more.
    * Ties are broken by number of sends, then by best grade, then by the date
      of the first send, then by user id. The ordering is therefore stable.
    """
    rows: dict[int, LeaderboardRow] = {
        user_id: LeaderboardRow(
            user_id=user_id,
            display_name=display_name,
            climbing_level=level,
        )
        for user_id, display_name, level in users
    }

    for achievement in achievements:
        if achievement.result is not ResultType.SENT:
            continue
        row = rows.get(achievement.user_id)
        if row is None:
            continue
        index = grade_to_index(achievement.grade)
        if index is None:
            continue
        row.total_sends += 1
        row.score += index + BASE_SCORE_PER_SEND
        row.sent_grade_indices.append(index)
        if index > row.best_grade_index:
            row.best_grade_index = index
            row.best_grade = index_to_grade(index)
        if row.first_send_on is None or achievement.climbed_on < row.first_send_on:
            row.first_send_on = achievement.climbed_on

    ordered = sorted(
        rows.values(),
        key=lambda row: (
            -row.score,
            -row.total_sends,
            -row.best_grade_index,
            row.first_send_on or date.max,
            row.user_id,
        ),
    )
    return ordered


def rank_rows(rows: list[LeaderboardRow]) -> list[tuple[int, LeaderboardRow]]:
    """Assign competition ranks (1, 1, 3, …) to the ordered leaderboard.

    Two climbers share a rank when they match on every ranking criterion:
    score, number of sends, best grade and the date of the first send. The
    user id is only used to keep the order stable, never to separate ranks.
    """
    ranked: list[tuple[int, LeaderboardRow]] = []
    previous: tuple | None = None
    previous_rank = 0
    for position, row in enumerate(rows, start=1):
        key = (row.score, row.total_sends, row.best_grade_index, row.first_send_on)
        if previous is not None and key == previous:
            rank = previous_rank
        else:
            rank = position
            previous = key
            previous_rank = rank
        ranked.append((rank, row))
    return ranked


def is_route_visible(status: RouteStatus) -> bool:
    """Return whether a route status should be listed publicly."""
    return status is RouteStatus.ACTIVE
