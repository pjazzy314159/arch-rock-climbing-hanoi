"""Public, unauthenticated API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Achievement,
    ClimbRoute,
    ContactMessage,
    Course,
    Event,
    FaqEntry,
    GymInfo,
    OpeningHour,
    Price,
    Product,
    ResultType,
    RouteStatus,
    Rule,
    Service,
)
from app.schemas import (
    ContactMessageIn,
    ContactMessageOut,
    CourseOut,
    EventOut,
    FaqOut,
    GymOut,
    Message,
    OpeningHourOut,
    PriceOut,
    ProductOut,
    RouteSummary,
    RuleOut,
    ServiceOut,
)
from app.services.climbing import tally_votes

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/gym", response_model=GymOut)
def get_gym(db: Session = Depends(get_db)) -> GymOut:
    """Gym information together with the published opening hours."""
    info = db.scalar(select(GymInfo).where(GymInfo.id == 1))
    hours = db.scalars(select(OpeningHour).order_by(OpeningHour.day_of_week)).all()

    if info is None:
        return GymOut(
            name="ARCH Rock Climbing Hanoi",
            tagline="Rock climbing. Real connection.",
            opening_hours=[OpeningHourOut.model_validate(h) for h in hours],
        )

    payload = GymOut.model_validate(info)
    payload.opening_hours = [OpeningHourOut.model_validate(h) for h in hours]
    # The gym record only becomes real once ARCH supplies verified details.
    payload.is_placeholder = (
        not any([payload.address, payload.phone, payload.email, payload.opening_note])
        and not payload.opening_hours
    )
    return payload


@router.get("/prices", response_model=list[PriceOut])
def list_prices(db: Session = Depends(get_db)) -> list[PriceOut]:
    """Published price list."""
    prices = db.scalars(
        select(Price).where(Price.is_active.is_(True)).order_by(Price.sort_order, Price.id)
    ).all()
    return [PriceOut.model_validate(price) for price in prices]


@router.get("/services", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)) -> list[ServiceOut]:
    """Published services."""
    services = db.scalars(
        select(Service).where(Service.is_active.is_(True)).order_by(Service.sort_order, Service.id)
    ).all()
    return [ServiceOut.model_validate(service) for service in services]


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)) -> list[CourseOut]:
    """Published courses."""
    courses = db.scalars(select(Course).where(Course.is_active.is_(True)).order_by(Course.id)).all()
    return [CourseOut.model_validate(course) for course in courses]


@router.get("/events", response_model=list[EventOut])
def list_events(
    db: Session = Depends(get_db),
    include_past: bool = Query(default=False),
) -> list[EventOut]:
    """Public events, upcoming by default."""
    statement = select(Event).where(Event.is_public.is_(True))
    if not include_past:
        now = datetime.now(UTC)
        statement = statement.where(Event.starts_at >= now)
    events = db.scalars(statement.order_by(Event.starts_at)).all()
    return [EventOut.model_validate(event) for event in events]


@router.get("/rules", response_model=list[RuleOut])
def list_rules(db: Session = Depends(get_db)) -> list[RuleOut]:
    """Published gym rules."""
    rules = db.scalars(
        select(Rule).where(Rule.is_active.is_(True)).order_by(Rule.sort_order, Rule.id)
    ).all()
    return [RuleOut.model_validate(rule) for rule in rules]


@router.get("/faq", response_model=list[FaqOut])
def list_faq(db: Session = Depends(get_db)) -> list[FaqOut]:
    """Published questions and answers."""
    entries = db.scalars(
        select(FaqEntry).where(FaqEntry.is_published.is_(True)).order_by(FaqEntry.id)
    ).all()
    return [FaqOut.model_validate(entry) for entry in entries]


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)) -> list[ProductOut]:
    """Active shop catalogue."""
    products = db.scalars(
        select(Product).where(Product.is_active.is_(True)).order_by(Product.id)
    ).all()
    return [ProductOut.model_validate(product) for product in products]


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductOut:
    """A single catalogue entry."""
    product = db.get(Product, product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return ProductOut.model_validate(product)


@router.get("/routes", response_model=list[RouteSummary])
def list_routes(
    db: Session = Depends(get_db),
    grade: str | None = Query(default=None),
    zone: str | None = Query(default=None),
    search: str | None = Query(default=None),
    fresh_only: bool = Query(default=False),
) -> list[RouteSummary]:
    """The public route directory with community vote summaries."""
    statement = select(ClimbRoute).where(ClimbRoute.status == RouteStatus.ACTIVE)
    if grade:
        statement = statement.where(ClimbRoute.grade == grade)
    if zone:
        statement = statement.where(ClimbRoute.zone == zone)
    if search:
        statement = statement.where(ClimbRoute.name.ilike(f"%{search}%"))
    routes = db.scalars(statement.order_by(ClimbRoute.id)).all()

    summaries: list[RouteSummary] = []
    for route in routes:
        summary = RouteSummary.model_validate(route)
        tally = tally_votes(route.id, route.grade, [vote.value for vote in route.votes])
        summary.vote_count = tally.total
        summary.easier_votes = tally.easier
        summary.as_set_votes = tally.as_set
        summary.harder_votes = tally.harder
        summary.perceived_grade = tally.perceived_grade
        summary.sends = (
            db.scalar(
                select(func.count())
                .select_from(Achievement)
                .where(Achievement.route_id == route.id, Achievement.result == ResultType.SENT)
            )
            or 0
        )
        summary.is_fresh = bool(
            route.set_at and (datetime.now(UTC).date() - route.set_at).days <= 7
        )
        summaries.append(summary)
    return summaries


@router.get("/routes/{route_id}", response_model=RouteSummary)
def get_route(route_id: int, db: Session = Depends(get_db)) -> RouteSummary:
    """A single route with its community vote summary."""
    route = db.get(ClimbRoute, route_id)
    if route is None or route.status != RouteStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    summary = RouteSummary.model_validate(route)
    tally = tally_votes(route.id, route.grade, [vote.value for vote in route.votes])
    summary.vote_count = tally.total
    summary.easier_votes = tally.easier
    summary.as_set_votes = tally.as_set
    summary.harder_votes = tally.harder
    summary.perceived_grade = tally.perceived_grade
    return summary


@router.post("/contact", response_model=ContactMessageOut, status_code=status.HTTP_201_CREATED)
def submit_contact(
    payload: ContactMessageIn,
    db: Session = Depends(get_db),
) -> ContactMessageOut:
    """Store a message from the public contact form."""
    message = ContactMessage(
        name=payload.name.strip(),
        email=payload.email.strip(),
        subject=payload.subject.strip() or "General",
        message=payload.message.strip(),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return ContactMessageOut.model_validate(message)


@router.get("/coverage", response_model=Message)
def coverage() -> Message:
    """State which parts of the public site still contain placeholder content."""
    return Message(
        detail=(
            "Prices, opening hours, courses, events and contact details are "
            "placeholders until ARCH supplies the verified information."
        )
    )
