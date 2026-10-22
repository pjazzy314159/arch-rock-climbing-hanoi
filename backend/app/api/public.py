"""Public, unauthenticated API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

# ``status`` is imported under another name: the route list has a query
# parameter called ``status``, which would otherwise shadow the module.
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    ClimbRoute,
    ContactMessage,
    Course,
    Event,
    FaqEntry,
    GymInfo,
    OpeningHour,
    Price,
    Product,
    RouteStatus,
    Rule,
    Service,
    Wall,
    WallType,
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
    WallOut,
)
from app.services.climbing import build_route_summary

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
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Product not found")
    return ProductOut.model_validate(product)


@router.get("/routes", response_model=list[RouteSummary])
def list_routes(
    db: Session = Depends(get_db),
    grade: str | None = Query(default=None),
    wall: str | None = Query(default=None),
    wall_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    fresh_only: bool = Query(default=False),
) -> list[RouteSummary]:
    """The public route directory with community vote summaries.

    Only active routes are listed by default. A status can be asked for
    explicitly, and an archived route keeps its place in the directory with its
    status shown, rather than silently disappearing.
    """
    statement = select(ClimbRoute)
    if status == "all":
        # Every status is asked for, so no status filter is applied.
        pass
    elif status:
        try:
            wanted = RouteStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST, detail="Unknown route status"
            ) from None
        statement = statement.where(ClimbRoute.status == wanted)
    else:
        statement = statement.where(ClimbRoute.status == RouteStatus.ACTIVE)

    if grade:
        statement = statement.where(ClimbRoute.grade == grade)
    if wall:
        statement = statement.join(Wall).where(Wall.name == wall)
    if wall_type:
        try:
            wanted_type = WallType(wall_type)
        except ValueError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST, detail="Unknown wall type"
            ) from None
        statement = statement.where(ClimbRoute.wall_type == wanted_type)
    if search:
        statement = statement.where(ClimbRoute.name.ilike(f"%{search}%"))
    if fresh_only:
        statement = statement.where(
            ClimbRoute.set_at >= datetime.now(UTC).date() - timedelta(days=7)
        )

    routes = db.scalars(statement.order_by(ClimbRoute.id)).all()
    return [build_route_summary(db, route) for route in routes]


@router.get("/walls", response_model=list[WallOut])
def list_walls(db: Session = Depends(get_db)) -> list[WallOut]:
    """The walls in the gym, with the photograph each one is set against."""
    walls = db.scalars(select(Wall).order_by(Wall.sort_order, Wall.id)).all()
    return [WallOut.model_validate(wall) for wall in walls]


@router.get("/routes/{route_id}", response_model=RouteSummary)
def get_route(route_id: int, db: Session = Depends(get_db)) -> RouteSummary:
    """A single route with its community vote summary.

    An archived route is still returned, with its status, so a member who
    follows an old link is told it has been taken down rather than being shown
    a page that does not exist.
    """
    route = db.get(ClimbRoute, route_id)
    if route is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Route not found")
    return build_route_summary(db, route)


@router.post("/contact", response_model=ContactMessageOut, status_code=http_status.HTTP_201_CREATED)
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
