"""Administrator endpoints.

Everything here is restricted to the ``admin`` role on the backend; hiding the
buttons in the frontend is not treated as access control.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import (
    AgreementStatus,
    ClimbRoute,
    ContactMessage,
    Course,
    Event,
    Product,
    Role,
    RouteStatus,
    RouteVote,
    SafetyAgreement,
    StaffTask,
    TaskStatus,
    User,
    Wall,
)
from app.schemas import (
    AdminCustomerDetailOut,
    AdminCustomerListOut,
    AdminMemberOut,
    AdminSummaryOut,
    AgreementOut,
    AgreementUpdateIn,
    ContactMessageOut,
    EventCreateIn,
    EventOut,
    RouteCreateIn,
    RouteOut,
    RouteSummary,
    RouteUpdateIn,
    TaskOut,
    WallCreateIn,
    WallOut,
)
from app.services.climbing import build_route_out, build_route_summary
from app.services.customers import (
    get_customer_detail,
)
from app.services.customers import (
    list_customers as query_customers,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/summary", response_model=AdminSummaryOut)
def admin_summary(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> AdminSummaryOut:
    """Headline numbers for the operations dashboard."""
    now = datetime.now(UTC)
    return AdminSummaryOut(
        members=db.scalar(select(func.count()).select_from(User).where(User.role == "customer"))
        or 0,
        staff=db.scalar(select(func.count()).select_from(User).where(User.role == "staff")) or 0,
        active_routes=db.scalar(
            select(func.count())
            .select_from(ClimbRoute)
            .where(ClimbRoute.status == RouteStatus.ACTIVE)
        )
        or 0,
        archived_routes=db.scalar(
            select(func.count())
            .select_from(ClimbRoute)
            .where(ClimbRoute.status == RouteStatus.ARCHIVED)
        )
        or 0,
        upcoming_events=db.scalar(
            select(func.count()).select_from(Event).where(Event.starts_at >= now)
        )
        or 0,
        open_tasks=db.scalar(
            select(func.count())
            .select_from(StaffTask)
            .where(StaffTask.status.in_([TaskStatus.TODO, TaskStatus.IN_PROGRESS]))
        )
        or 0,
        pending_agreements=db.scalar(
            select(func.count())
            .select_from(SafetyAgreement)
            .where(SafetyAgreement.status == AgreementStatus.PENDING)
        )
        or 0,
        products=db.scalar(select(func.count()).select_from(Product)) or 0,
    )


@router.get("/members", response_model=list[AdminMemberOut])
def list_members(
    search: str | None = Query(default=None, max_length=160),
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[AdminMemberOut]:
    """Legacy customer list; the paginated directory is ``/customers``."""
    page = query_customers(db, search=search, limit=limit)
    return page.items


@router.get("/customers", response_model=AdminCustomerListOut)
def list_customer_directory(
    search: str | None = Query(default=None, max_length=160),
    role: Role | None = Query(default=None),
    status_filter: Literal["active", "inactive"] | None = Query(default=None, alias="status"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminCustomerListOut:
    """A bounded, server-searched directory of accounts for administrators."""
    page = query_customers(
        db,
        search=search,
        role=role,
        active=None if status_filter is None else status_filter == "active",
        limit=limit,
        offset=offset,
    )
    return AdminCustomerListOut(
        items=page.items,
        total=page.total,
        limit=limit,
        offset=offset,
    )


@router.get("/customers/{customer_id}", response_model=AdminCustomerDetailOut)
def customer_detail(
    customer_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminCustomerDetailOut:
    """One customer's safe profile, agreement and bounded activity history."""
    detail = get_customer_detail(db, customer_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return detail


@router.get("/contact", response_model=list[ContactMessageOut])
def list_contact_messages(
    include_handled: bool = Query(default=False),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ContactMessageOut]:
    """The enquiries sent through the contact form.

    The form has always stored the message; without this the gym could never
    read what it received.
    """
    statement = select(ContactMessage)
    if not include_handled:
        statement = statement.where(ContactMessage.handled.is_(False))
    messages = db.scalars(statement.order_by(ContactMessage.created_at.desc())).all()
    return [ContactMessageOut.model_validate(message) for message in messages]


@router.patch("/contact/{message_id}", response_model=ContactMessageOut)
def update_contact_message(
    message_id: int,
    handled: bool = True,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ContactMessageOut:
    """Mark an enquiry as handled, or put it back in the inbox."""
    message = db.get(ContactMessage, message_id)
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    message.handled = handled
    db.commit()
    db.refresh(message)
    return ContactMessageOut.model_validate(message)


@router.get("/routes", response_model=list[RouteSummary])
def list_all_routes(
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[RouteSummary]:
    """Every route, including archived and pending resets."""
    statement = select(ClimbRoute)
    if status_filter:
        try:
            statement = statement.where(ClimbRoute.status == RouteStatus(status_filter))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown route status"
            ) from None
    routes = db.scalars(statement.order_by(ClimbRoute.id)).all()
    return [build_route_summary(db, route) for route in routes]


@router.get("/walls", response_model=list[WallOut])
def list_all_walls(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[WallOut]:
    """Every wall, including the ones that are not in use."""
    walls = db.scalars(select(Wall).order_by(Wall.sort_order, Wall.id)).all()
    return [WallOut.model_validate(wall) for wall in walls]


@router.post("/walls", response_model=WallOut, status_code=status.HTTP_201_CREATED)
def create_wall(
    payload: WallCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> WallOut:
    """Add a wall to the gym."""
    name = payload.name.strip()
    if db.scalar(select(Wall).where(Wall.name == name)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Wall already exists")
    wall = Wall(
        name=name,
        description=payload.description.strip(),
        image_url=(payload.image_url or "").strip() or None,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(wall)
    db.commit()
    db.refresh(wall)
    return WallOut.model_validate(wall)


@router.post("/routes", response_model=RouteOut, status_code=status.HTTP_201_CREATED)
def create_route(
    payload: RouteCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RouteOut:
    """Create a route."""
    wall = db.get(Wall, payload.wall_id) if payload.wall_id is not None else None
    if payload.wall_id is not None and wall is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")

    route = ClimbRoute(
        name=payload.name.strip(),
        grade=payload.grade.strip().upper(),
        wall_id=wall.id if wall is not None else None,
        wall_type=payload.wall_type,
        color=payload.color.strip() or "lime",
        style=payload.style.strip(),
        setter=payload.setter.strip(),
        set_at=payload.set_at,
        beta=(payload.beta or "").strip() or None,
        image_url=(payload.image_url or "").strip() or None,
        status=payload.status,
        created_by_id=user.id,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return build_route_out(route)


@router.patch("/routes/{route_id}", response_model=RouteOut)
def update_route(
    route_id: int,
    payload: RouteUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RouteOut:
    """Update a route or change its active / archived status."""
    route = db.get(ClimbRoute, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    if payload.name is not None:
        route.name = payload.name.strip()
    if payload.grade is not None:
        route.grade = payload.grade.strip().upper()
    if payload.wall_id is not None:
        if db.get(Wall, payload.wall_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")
        route.wall_id = payload.wall_id
    if payload.wall_type is not None:
        route.wall_type = payload.wall_type
    if payload.color is not None:
        route.color = payload.color.strip()
    if payload.style is not None:
        route.style = payload.style.strip()
    if payload.setter is not None:
        route.setter = payload.setter.strip()
    if payload.set_at is not None:
        route.set_at = payload.set_at
    if payload.beta is not None:
        route.beta = payload.beta.strip() or None
    if payload.image_url is not None:
        route.image_url = payload.image_url.strip() or None
    if payload.status is not None:
        route.status = payload.status
        route.archived_at = datetime.now(UTC) if payload.status is RouteStatus.ARCHIVED else None
    db.commit()
    db.refresh(route)
    return build_route_out(route)


@router.get("/votes", response_model=list[dict])
def list_votes(
    route_id: int | None = Query(default=None),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Raw votes, for auditing the community feedback."""
    statement = select(RouteVote, User.full_name).join(User, User.id == RouteVote.user_id)
    if route_id is not None:
        statement = statement.where(RouteVote.route_id == route_id)
    rows = db.execute(statement.order_by(RouteVote.created_at.desc())).all()
    return [
        {
            "id": vote.id,
            "route_id": vote.route_id,
            "user_id": vote.user_id,
            "user_name": full_name,
            "value": vote.value.value,
            "voter_level": vote.voter_level,
            "created_at": vote.created_at.isoformat(),
        }
        for vote, full_name in rows
    ]


@router.get("/agreements", response_model=list[AgreementOut])
def list_agreements(
    agreement_status: str | None = Query(default=None, alias="status"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[AgreementOut]:
    """Customer safety-agreement records."""
    statement = select(SafetyAgreement)
    if agreement_status:
        try:
            statement = statement.where(SafetyAgreement.status == AgreementStatus(agreement_status))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown agreement status"
            ) from None
    agreements = db.scalars(statement.order_by(SafetyAgreement.id)).all()
    return [AgreementOut.model_validate(agreement) for agreement in agreements]


@router.patch("/agreements/{agreement_id}", response_model=AgreementOut)
def update_agreement(
    agreement_id: int,
    payload: AgreementUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AgreementOut:
    """Record a staff-side decision on an agreement."""
    agreement = db.get(SafetyAgreement, agreement_id)
    if agreement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")
    agreement.status = payload.status
    if payload.method:
        agreement.method = payload.method
    if payload.notes is not None:
        agreement.notes = payload.notes.strip() or None
    if payload.status is AgreementStatus.SIGNED and agreement.signed_at is None:
        agreement.signed_at = datetime.now(UTC)
    db.commit()
    db.refresh(agreement)
    return AgreementOut.model_validate(agreement)


@router.get("/tasks", response_model=list[TaskOut])
def list_all_tasks(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[TaskOut]:
    """Every task, for the operations view."""
    from app.api.staff import _task_to_out

    tasks = db.scalars(select(StaffTask).order_by(StaffTask.id)).all()
    return [_task_to_out(task) for task in tasks]


@router.get("/events", response_model=list[EventOut])
def list_all_events(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[EventOut]:
    """Every event, including private ones."""
    events = db.scalars(select(Event).order_by(Event.starts_at)).all()
    return [EventOut.model_validate(event) for event in events]


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: EventCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> EventOut:
    """Create a gym event."""
    event = Event(
        title=payload.title.strip(),
        description=payload.description.strip(),
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        location=payload.location.strip(),
        capacity=payload.capacity,
        is_public=payload.is_public,
        created_by_id=user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventOut.model_validate(event)


@router.get("/courses")
def list_all_courses(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[dict]:
    """Every course, including inactive ones."""
    courses = db.scalars(select(Course).order_by(Course.id)).all()
    return [
        {
            "id": course.id,
            "title": course.title,
            "level": course.level,
            "summary": course.summary,
            "instructor": course.instructor,
            "schedule": course.schedule,
            "price_vnd": course.price_vnd,
            "capacity": course.capacity,
            "is_active": course.is_active,
        }
        for course in courses
    ]
