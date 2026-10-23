"""Read-only customer queries for the administrator workspace.

The customer directory is deliberately built from the existing ``users``,
``safety_agreements`` and ``achievements`` tables. Agreement status and send
counts are correlated subqueries so a page of customers does not issue one
query per row.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    ContactMessage,
    ResultType,
    Role,
    SafetyAgreement,
    User,
)
from app.schemas import (
    AdminCustomerActivityOut,
    AdminCustomerAgreementOut,
    AdminCustomerAttemptOut,
    AdminCustomerContactOut,
    AdminCustomerDetailOut,
    AdminCustomerOut,
)


@dataclass(frozen=True)
class CustomerPage:
    """One bounded page of customer rows and the total matching count."""

    items: list[AdminCustomerOut]
    total: int


def _search_pattern(value: str) -> str:
    """Escape SQL LIKE wildcards so a literal search does not match everything."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _enum_value(value: object) -> str | None:
    """Return a stable string for an enum-backed column or ``None``."""
    if value is None:
        return None
    return getattr(value, "value", str(value))


def list_customers(
    db: Session,
    *,
    search: str | None = None,
    role: Role | None = None,
    active: bool | None = None,
    limit: int = 25,
    offset: int = 0,
) -> CustomerPage:
    """Return a filtered, stably ordered page of customer summaries."""
    conditions = []
    if search and search.strip():
        pattern = _search_pattern(search.strip())
        conditions.append(
            or_(
                User.full_name.ilike(pattern, escape="\\"),
                User.email.ilike(pattern, escape="\\"),
                User.phone.ilike(pattern, escape="\\"),
            )
        )
    if role is not None:
        conditions.append(User.role == role)
    if active is not None:
        conditions.append(User.is_active.is_(active))

    total = db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0

    latest_agreement = (
        select(SafetyAgreement.status)
        .where(SafetyAgreement.user_id == User.id)
        .order_by(SafetyAgreement.created_at.desc(), SafetyAgreement.id.desc())
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )
    send_count = (
        select(func.count(Achievement.id))
        .where(
            Achievement.user_id == User.id,
            Achievement.result == ResultType.SENT,
        )
        .correlate(User)
        .scalar_subquery()
    )
    last_climb = (
        select(func.max(Achievement.climbed_on))
        .where(Achievement.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )

    statement = (
        select(
            User,
            latest_agreement.label("agreement_status"),
            send_count.label("total_sends"),
            last_climb.label("last_climb_on"),
        )
        .where(*conditions)
        .order_by(User.full_name.asc(), User.id.asc())
        .limit(limit)
        .offset(offset)
    )

    items: list[AdminCustomerOut] = []
    for user, agreement_status, sends, last_climb_on in db.execute(statement).all():
        item = AdminCustomerOut.model_validate(user)
        item.role = user.role.value
        item.agreement_status = _enum_value(agreement_status)
        item.total_sends = sends or 0
        item.last_climb_on = last_climb_on
        items.append(item)

    return CustomerPage(items=items, total=total)


def get_customer_detail(db: Session, user_id: int) -> AdminCustomerDetailOut | None:
    """Return one customer's authorised detail, or ``None`` if absent.

    Activity is aggregated in the database. Only the ten latest climbs and
    five messages with the same email are read, so the response cannot grow
    with the customer's history.
    """
    user = db.get(User, user_id)
    if user is None:
        return None

    agreement = db.scalar(
        select(SafetyAgreement)
        .where(SafetyAgreement.user_id == user.id)
        .order_by(SafetyAgreement.created_at.desc(), SafetyAgreement.id.desc())
    )

    stats = db.execute(
        select(
            func.count(Achievement.id),
            func.sum(case((Achievement.result == ResultType.SENT, 1), else_=0)),
            func.sum(
                case(
                    (
                        and_(
                            Achievement.result == ResultType.SENT,
                            Achievement.attempts == 1,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((Achievement.result == ResultType.PROJECT, 1), else_=0)),
            func.coalesce(func.sum(Achievement.attempts), 0),
        ).where(Achievement.user_id == user.id)
    ).one()
    sends = int(stats[1] or 0)
    flashes = int(stats[2] or 0)
    projects = int(stats[3] or 0)
    attempts = int(stats[4] or 0)

    recent = db.scalars(
        select(Achievement)
        .where(Achievement.user_id == user.id)
        .order_by(Achievement.climbed_on.desc(), Achievement.id.desc())
        .limit(10)
    ).all()

    contact_messages = db.scalars(
        select(ContactMessage)
        .where(func.lower(ContactMessage.email) == user.email.lower())
        .order_by(ContactMessage.created_at.desc(), ContactMessage.id.desc())
        .limit(5)
    ).all()

    agreement_out = None
    if agreement is not None:
        agreement_out = AdminCustomerAgreementOut(
            id=agreement.id,
            version=agreement.version,
            status=agreement.status.value,
            method=agreement.method.value if agreement.method else None,
            signed_at=agreement.signed_at,
            signed_name=agreement.signed_name,
            notes=agreement.notes,
        )

    return AdminCustomerDetailOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
        membership_tier=user.membership_tier,
        membership_status=user.membership_status,
        joined_on=user.joined_on,
        created_at=user.created_at,
        agreement_status=agreement.status.value if agreement else None,
        total_sends=sends,
        last_climb_on=recent[0].climbed_on if recent else None,
        phone=user.phone,
        climbing_level=user.climbing_level,
        agreement=agreement_out,
        activity=AdminCustomerActivityOut(
            sends=sends,
            flashes=flashes,
            projects=projects,
            attempts=attempts,
            total_climbs=int(stats[0] or 0),
        ),
        recent_attempts=[
            AdminCustomerAttemptOut(
                id=achievement.id,
                route_id=achievement.route_id,
                route_name=achievement.route_name,
                grade=achievement.grade,
                result=achievement.result.value,
                attempts=achievement.attempts,
                climbed_on=achievement.climbed_on,
                created_at=achievement.created_at,
            )
            for achievement in recent
        ],
        recent_contact_messages=[
            AdminCustomerContactOut(
                id=message.id,
                subject=message.subject,
                handled=message.handled,
                created_at=message.created_at,
            )
            for message in contact_messages
        ],
        contact_history_note=(
            "Contact messages are not linked to customer accounts. These are recent "
            "messages using the same email address."
        ),
    )
