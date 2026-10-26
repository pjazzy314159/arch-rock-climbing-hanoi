"""The member dashboard.

Every number here comes from the member's own rows, or from the gym's own
route list. Nothing is estimated and nothing is invented.

The rules that are already in ``app/services/climbing.py`` — the grade
arithmetic, the scoring and the tie-breaking — are **reused**, not
reimplemented, so the dashboard and the leaderboard cannot disagree.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Achievement, ClimbRoute, ResultType, RouteStatus, User
from app.schemas.dashboard import (
    DashboardOut,
    GradeStat,
    OutcomeCounts,
    RankingInfo,
    RecentAttempt,
)
from app.services.climbing import (
    LEADERBOARD_SCORING_RULE,
    PERCENTILE_RULE,
    build_leaderboard,
    grade_to_index,
    index_to_grade,
    rank_rows,
)

#: How many of the member's most recent climbs the dashboard lists.
RECENT_ATTEMPT_LIMIT = 5


def count_active_routes(db: Session) -> int:
    """How many routes are on the wall at the gym right now."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(ClimbRoute)
            .where(ClimbRoute.status == RouteStatus.ACTIVE)
        )
        or 0
    )


def is_flash(achievement: Achievement) -> bool:
    """Whether a logged climb was a send on the first attempt.

    A flash is derived, not stored: it is a send with exactly one attempt.
    """
    return achievement.result is ResultType.SENT and achievement.attempts == 1


def build_outcomes(achievements: list[Achievement]) -> OutcomeCounts:
    """Break the member's logged climbs down into outcomes."""
    sends = [item for item in achievements if item.result is ResultType.SENT]
    projects = [item for item in achievements if item.result is ResultType.PROJECT]
    return OutcomeCounts(
        sends=len(sends),
        flashes=sum(1 for item in sends if item.attempts == 1),
        projects=len(projects),
        attempts=sum(item.attempts for item in achievements),
    )


def build_grade_stats(achievements: list[Achievement]) -> list[GradeStat]:
    """The member's own record, grouped by grade, easiest first.

    A grade the member has only tried appears too, with its projects and no
    sends, so a project is never hidden by the absence of a send.
    """
    stats: dict[str, GradeStat] = {}
    for item in achievements:
        stat = stats.setdefault(item.grade, GradeStat(grade=item.grade))
        if item.result is ResultType.SENT:
            stat.sends += 1
            if item.attempts == 1:
                stat.flashes += 1
        else:
            stat.projects += 1

    def sort_key(stat: GradeStat) -> tuple[bool, int, str]:
        index = grade_to_index(stat.grade)
        # A grade that is not on the V scale sorts after the ones that are.
        return (index is None, index if index is not None else 0, stat.grade)

    return sorted(stats.values(), key=sort_key)


def build_ranking(db: Session, user: User) -> RankingInfo:
    """Where the member stands, under the leaderboard's own rule.

    The rule is the leaderboard's and is **not** changed here: sends only,
    one point per grade step (V0 = 1 point), ties broken by number of sends,
    then best grade, then the date of the first send. Climbers with no sends
    are not ranked.

    The percentile is the share of ranked climbers who are at or behind the
    member's position, as a whole percentage. The top-ranked climber is
    therefore at the 100th percentile, and the last one at the lowest. It is
    ``None`` for a member who is not ranked, rather than zero.

    The rules are sent with the answer, so the page states the rule that was
    actually applied rather than one written out again somewhere else.
    """
    users = db.scalars(select(User).where(User.is_active.is_(True))).all()
    # The whole gym's climbs are needed to know where the member stands. This
    # is the same calculation the leaderboard makes, so the two agree.
    all_achievements = db.scalars(select(Achievement)).all()
    rows = build_leaderboard(
        [(item.id, item.full_name, item.climbing_level) for item in users],
        all_achievements,
    )
    ranked = [(rank, row) for rank, row in rank_rows(rows) if row.total_sends > 0]
    ranked_count = len(ranked)

    entry = next((row for _rank, row in ranked if row.user_id == user.id), None)
    if entry is None:
        # The member has no sends, so they are not on the leaderboard. Their
        # own score is still reported, so the page can say what it would take.
        return RankingInfo(
            rank=None,
            ranked_count=ranked_count,
            ahead=ranked_count,
            percentile=None,
            score=0,
            total_sends=0,
            best_grade=None,
            scoring_rule=LEADERBOARD_SCORING_RULE,
            percentile_rule=PERCENTILE_RULE,
        )

    member_rank = next(rank for rank, row in ranked if row.user_id == user.id)
    # Climbers who share the member's rank are not ahead of them.
    ahead = sum(1 for rank, _row in ranked if rank < member_rank)
    percentile = round(100 * (ranked_count - ahead) / ranked_count) if ranked_count else None

    return RankingInfo(
        rank=member_rank,
        ranked_count=ranked_count,
        ahead=ahead,
        percentile=percentile,
        score=entry.score,
        total_sends=entry.total_sends,
        best_grade=entry.best_grade,
        scoring_rule=LEADERBOARD_SCORING_RULE,
        percentile_rule=PERCENTILE_RULE,
    )


def build_recent_attempts(db: Session, user: User) -> list[RecentAttempt]:
    """The member's most recent logged climbs, newest first."""
    entries = db.scalars(
        select(Achievement)
        .where(Achievement.user_id == user.id)
        .order_by(Achievement.climbed_on.desc(), Achievement.id.desc())
        .limit(RECENT_ATTEMPT_LIMIT)
    ).all()
    return [
        RecentAttempt(
            id=entry.id,
            route_id=entry.route_id,
            route_name=entry.route_name,
            grade=entry.grade,
            result=entry.result,
            attempts=entry.attempts,
            climbed_on=entry.climbed_on,
            is_flash=is_flash(entry),
        )
        for entry in entries
    ]


def build_dashboard(db: Session, user: User, agreement_status: str | None = None) -> DashboardOut:
    """Build the whole dashboard for one member."""
    achievements = list(db.scalars(select(Achievement).where(Achievement.user_id == user.id)).all())
    sends = [item for item in achievements if item.result is ResultType.SENT]

    best_grade: str | None = None
    best_index = -1
    for item in sends:
        index = grade_to_index(item.grade)
        if index is not None and index > best_index:
            best_index = index
            best_grade = index_to_grade(index)

    climbed_on = [item.climbed_on for item in achievements]
    sessions = len(set(climbed_on))

    return DashboardOut(
        active_routes=count_active_routes(db),
        total_sends=len(sends),
        total_sessions=sessions,
        best_grade=best_grade,
        active_projects=sum(1 for item in achievements if item.result is ResultType.PROJECT),
        outcomes=build_outcomes(achievements),
        by_grade=build_grade_stats(achievements),
        ranking=build_ranking(db, user),
        recent_attempts=build_recent_attempts(db, user),
        has_activity=bool(achievements),
        first_climb=min(climbed_on) if climbed_on else None,
        last_climb=max(climbed_on) if climbed_on else None,
        agreement_status=agreement_status,
    )
