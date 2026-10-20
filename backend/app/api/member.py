"""Customer-facing endpoints for signed-in members."""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import (
    Achievement,
    AgreementMethod,
    AgreementStatus,
    ClimbRoute,
    ResultType,
    RouteStatus,
    RouteVote,
    SafetyAgreement,
    User,
)
from app.schemas import (
    AchievementIn,
    AchievementOut,
    AgreementOut,
    AgreementSignIn,
    DashboardOut,
    LeaderboardEntry,
    VoteIn,
    VoteOut,
    VoteTally,
)
from app.services.climbing import (
    build_leaderboard,
    grade_to_index,
    index_to_grade,
    rank_rows,
    tally_votes,
)

router = APIRouter(prefix="/api/me", tags=["member"])


def _latest_agreement(db: Session, user_id: int) -> SafetyAgreement | None:
    return db.scalar(
        select(SafetyAgreement)
        .where(SafetyAgreement.user_id == user_id)
        .order_by(SafetyAgreement.created_at.desc(), SafetyAgreement.id.desc())
    )


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardOut:
    """Aggregate climbing statistics for the signed-in member."""
    achievements = db.scalars(select(Achievement).where(Achievement.user_id == user.id)).all()
    sends = [item for item in achievements if item.result is ResultType.SENT]
    projects = [item for item in achievements if item.result is ResultType.PROJECT]

    best_grade = None
    best_index = -1
    for item in sends:
        index = grade_to_index(item.grade)
        if index is not None and index > best_index:
            best_index = index
            best_grade = index_to_grade(index)

    sessions = len({item.climbed_on for item in achievements})
    agreement = _latest_agreement(db, user.id)

    return DashboardOut(
        total_sends=len(sends),
        total_sessions=sessions,
        best_grade=best_grade,
        active_projects=len(projects),
        agreement_status=agreement.status.value if agreement else None,
    )


@router.get("/logbook", response_model=list[AchievementOut])
def list_logbook(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[AchievementOut]:
    """The signed-in member's own climbing log."""
    entries = db.scalars(
        select(Achievement)
        .where(Achievement.user_id == user.id)
        .order_by(Achievement.climbed_on.desc(), Achievement.id.desc())
    ).all()
    return [AchievementOut.model_validate(entry) for entry in entries]


@router.post("/logbook", response_model=AchievementOut, status_code=status.HTTP_201_CREATED)
def log_climb(
    payload: AchievementIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AchievementOut:
    """Log a climb against the signed-in member's own record."""
    route_name = payload.route_name.strip()
    grade = payload.grade.strip()

    if payload.route_id is not None:
        route = db.get(ClimbRoute, payload.route_id)
        if route is not None:
            route_name = route.name
            grade = route.grade

    entry = Achievement(
        user_id=user.id,
        route_id=payload.route_id,
        route_name=route_name,
        grade=grade,
        result=payload.result,
        attempts=payload.attempts,
        climbed_on=payload.climbed_on or date.today(),
        notes=(payload.notes or "").strip() or None,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return AchievementOut.model_validate(entry)


@router.delete("/logbook/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log_entry(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Remove one of the member's own log entries."""
    entry = db.get(Achievement, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    db.delete(entry)
    db.commit()


@router.get("/agreement", response_model=AgreementOut)
def get_agreement(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AgreementOut:
    """The member's own safety agreement record."""
    agreement = _latest_agreement(db, user.id)
    if agreement is None:
        agreement = SafetyAgreement(
            user_id=user.id, version="2026-01", status=AgreementStatus.PENDING
        )
        db.add(agreement)
        db.commit()
        db.refresh(agreement)
    return AgreementOut.model_validate(agreement)


@router.post("/agreement/signature", response_model=AgreementOut)
def sign_agreement(
    payload: AgreementSignIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgreementOut:
    """Record the member's digital signature of the safety agreement.

    The signing workflow is provisional: ARCH still has to confirm whether
    digital signature, document upload or staff confirmation is required.
    """
    if not payload.accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The agreement must be accepted before it can be signed",
        )

    agreement = _latest_agreement(db, user.id)
    if agreement is None:
        agreement = SafetyAgreement(user_id=user.id, version="2026-01")
        db.add(agreement)

    agreement.status = AgreementStatus.SIGNED
    agreement.method = AgreementMethod.DIGITAL_SIGNATURE
    agreement.signed_at = datetime.now(UTC)
    agreement.signed_name = payload.signed_name.strip()
    db.commit()
    db.refresh(agreement)
    return AgreementOut.model_validate(agreement)


@router.post("/routes/{route_id}/vote", response_model=VoteOut)
def cast_vote(
    route_id: int,
    payload: VoteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VoteOut:
    """Cast or replace the member's difficulty vote for a route.

    Rules:

    * One active vote per person per route; voting again replaces the vote.
    * The climber's own level is recorded with the vote for auditing.
    * Height and weight are **not** collected.
    """
    route = db.get(ClimbRoute, route_id)
    if route is None or route.status != RouteStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    vote = db.scalar(
        select(RouteVote).where(RouteVote.route_id == route_id, RouteVote.user_id == user.id)
    )
    level = payload.climber_level if payload.climber_level is not None else user.climbing_level

    if vote is None:
        vote = RouteVote(route_id=route_id, user_id=user.id)
        db.add(vote)

    vote.value = payload.value
    vote.comment = (payload.comment or "").strip() or None
    vote.voter_level = level
    db.commit()
    db.refresh(vote)
    return VoteOut.model_validate(vote)


@router.delete("/routes/{route_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_vote(
    route_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Withdraw the member's vote for a route."""
    vote = db.scalar(
        select(RouteVote).where(RouteVote.route_id == route_id, RouteVote.user_id == user.id)
    )
    if vote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")
    db.delete(vote)
    db.commit()


@router.get("/routes/{route_id}/vote", response_model=VoteOut | None)
def get_own_vote(
    route_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VoteOut | None:
    """The member's own vote for a route, if they have voted."""
    vote = db.scalar(
        select(RouteVote).where(RouteVote.route_id == route_id, RouteVote.user_id == user.id)
    )
    return VoteOut.model_validate(vote) if vote else None


@router.get("/routes/{route_id}/tally", response_model=VoteTally)
def route_tally(route_id: int, db: Session = Depends(get_db)) -> VoteTally:
    """Aggregate community feedback for a route."""
    route = db.get(ClimbRoute, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    votes = db.scalars(select(RouteVote).where(RouteVote.route_id == route_id)).all()
    tally = tally_votes(route_id, route.grade, [vote.value for vote in votes])
    return VoteTally(
        route_id=tally.route_id,
        total=tally.total,
        easier=tally.easier,
        as_set=tally.as_set,
        harder=tally.harder,
        perceived_grade=tally.perceived_grade,
        official_grade=tally.official_grade,
    )


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(limit: int = 20, db: Session = Depends(get_db)) -> list[LeaderboardEntry]:
    """The community leaderboard.

    Scoring and tie-breaking rules are documented in
    ``app/services/climbing.py`` and covered by the backend test-suite.
    """
    users = db.scalars(select(User).where(User.is_active.is_(True))).all()
    achievements = db.scalars(select(Achievement)).all()
    rows = build_leaderboard(
        [(user.id, user.full_name, user.climbing_level) for user in users], achievements
    )
    ranked = rank_rows(rows)

    entries: list[LeaderboardEntry] = []
    for rank, row in ranked:
        if row.total_sends == 0:
            continue
        entries.append(
            LeaderboardEntry(
                rank=rank,
                user_id=row.user_id,
                display_name=row.display_name,
                total_sends=row.total_sends,
                best_grade=row.best_grade,
                score=row.score,
                climbing_level=row.climbing_level,
            )
        )
        if len(entries) >= max(1, min(limit, 100)):
            break
    return entries


@router.get("/stats", response_model=DashboardOut)
def member_stats(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardOut:
    """Alias for the dashboard, used by the progress page."""
    return dashboard(user=user, db=db)


@router.get("/sessions")
def session_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Number of distinct days the member has logged a climb."""
    count = db.scalar(
        select(func.count(func.distinct(Achievement.climbed_on))).where(
            Achievement.user_id == user.id
        )
    )
    return {"sessions": int(count or 0)}
