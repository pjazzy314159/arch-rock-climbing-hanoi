"""Administrator endpoints.

Everything here is restricted to the ``admin`` role on the backend; hiding the
buttons in the frontend is not treated as access control.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import (
    AgreementStatus,
    ClimbRoute,
    ContactMessage,
    Course,
    Event,
    FaqEntry,
    OpeningHour,
    Price,
    Product,
    Role,
    RouteStatus,
    RouteVote,
    Rule,
    SafetyAgreement,
    Service,
    StaffTask,
    TaskStatus,
    User,
    Wall,
)
from app.schemas import (
    AdminAssigneeOut,
    AdminCourseOut,
    AdminCustomerDetailOut,
    AdminCustomerListOut,
    AdminFaqOut,
    AdminMemberOut,
    AdminOpeningHourOut,
    AdminRuleOut,
    AdminSummaryOut,
    AgreementOut,
    AgreementUpdateIn,
    ContactMessageOut,
    CourseCreateIn,
    CourseUpdateIn,
    EventCreateIn,
    EventOut,
    EventUpdateIn,
    FaqCreateIn,
    FaqUpdateIn,
    OpeningHourCreateIn,
    OpeningHourUpdateIn,
    PriceCreateIn,
    PriceOut,
    PriceUpdateIn,
    ProductCreateIn,
    ProductOut,
    ProductUpdateIn,
    RouteCreateIn,
    RouteOut,
    RouteSummary,
    RouteUpdateIn,
    RuleCreateIn,
    RuleUpdateIn,
    ServiceCreateIn,
    ServiceOut,
    ServiceUpdateIn,
    TaskOut,
    WallCreateIn,
    WallOut,
    WallUpdateIn,
)
from app.services.climbing import build_route_out, build_route_summary
from app.services.customers import (
    get_customer_detail,
)
from app.services.customers import (
    list_customers as query_customers,
)
from app.storage import (
    ALLOWED_IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    StoredImage,
    detect_image_type,
    generate_object_key,
    get_storage_provider,
)

logger = logging.getLogger("arch.api.admin")

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


@router.get("/assignees", response_model=list[AdminAssigneeOut])
def list_task_assignees(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[AdminAssigneeOut]:
    """Staff and administrators who may be assigned tasks.

    This is deliberately a minimal identity response for an assignment control:
    no agreement, membership or other customer fields are returned. The team is
    expected to stay small, so the list is not paginated; ordering is stable.
    """
    users = db.scalars(
        select(User)
        .where(User.role.in_((Role.STAFF, Role.ADMIN)))
        .order_by(User.full_name, User.id)
    ).all()
    return [AdminAssigneeOut.model_validate(item) for item in users]


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


@router.patch("/walls/{wall_id}", response_model=WallOut)
def update_wall(
    wall_id: int,
    payload: WallUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> WallOut:
    """Update a wall."""
    wall = db.get(Wall, wall_id)
    if wall is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")

    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Wall name cannot be empty",
            )
        if db.scalar(select(Wall).where(Wall.name == name, Wall.id != wall_id)) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Wall already exists")
        wall.name = name
    if "description" in changes:
        wall.description = (changes["description"] or "").strip()
    if "image_url" in changes:
        wall.image_url = (changes["image_url"] or "").strip() or None
    if changes.get("sort_order") is not None:
        wall.sort_order = changes["sort_order"]
    if changes.get("is_active") is not None:
        wall.is_active = changes["is_active"]

    db.commit()
    db.refresh(wall)
    return WallOut.model_validate(wall)


@router.delete("/walls/{wall_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wall(
    wall_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a wall. Routes referencing it keep a null wall_id.

    The foreign key declares ``ON DELETE SET NULL``, but SQLite does not
    enforce foreign keys unless ``PRAGMA foreign_keys`` is enabled per
    connection. The detach step is therefore done explicitly so the
    behaviour is identical on SQLite and PostgreSQL.
    """
    wall = db.get(Wall, wall_id)
    if wall is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")

    db.execute(
        update(ClimbRoute).where(ClimbRoute.wall_id == wall_id).values(wall_id=None)
    )
    db.delete(wall)
    db.commit()


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(
    route_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a route. Votes and achievements cascade; draft hold set is orphaned."""
    route = db.get(ClimbRoute, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    db.delete(route)
    db.commit()


# --- Media uploads ---


@router.post("/media/images", response_model=StoredImage, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
) -> StoredImage:
    """Upload an image and return its public URL and metadata.

    The image is stored in the configured storage provider (local filesystem or R2).
    Only JPEG, PNG, and WebP formats are accepted, with a maximum size of 10 MB.
    """
    # The declared MIME type and filename are never trusted: the bytes are the
    # only evidence used to decide whether this is an allowed image.
    detected_type = detect_image_type(file.file)
    if detected_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format. Allowed: JPEG, PNG, WebP",
        )

    # Check file size
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    if size > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size: {MAX_IMAGE_BYTES // (1024 * 1024)} MB",
        )
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty",
        )

    # The object key is generated server-side from the detected type; the
    # uploaded filename is never used as a storage path.
    object_key = generate_object_key(detected_type)

    try:
        storage = get_storage_provider()
    except Exception:
        # Configuration details (bucket names, credentials) must never reach
        # the client. The server log keeps the diagnostic.
        logger.exception("Image storage is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image storage is not configured",
        ) from None

    try:
        stored = await storage.upload(file.file, detected_type, object_key)
    except Exception:
        logger.exception("Image upload failed for key %s", object_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image upload failed",
        ) from None

    return stored


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

    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes:
        route.name = changes["name"].strip()
    if "grade" in changes:
        route.grade = changes["grade"].strip().upper()
    if "wall_id" in changes:
        if changes["wall_id"] is not None:
            if db.get(Wall, changes["wall_id"]) is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")
            route.wall_id = changes["wall_id"]
        else:
            route.wall_id = None
    if "wall_type" in changes:
        route.wall_type = changes["wall_type"]
    if "color" in changes:
        route.color = changes["color"].strip()
    if "style" in changes:
        route.style = changes["style"].strip()
    if "setter" in changes:
        route.setter = changes["setter"].strip()
    if "set_at" in changes:
        route.set_at = changes["set_at"]
    if "beta" in changes:
        route.beta = changes["beta"].strip() or None
    if "image_url" in changes:
        route.image_url = changes["image_url"].strip() or None
    if "status" in changes:
        route.status = changes["status"]
        route.archived_at = datetime.now(UTC) if changes["status"] is RouteStatus.ARCHIVED else None
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
    from app.api.staff import _task_load_options, _task_to_out

    tasks = db.scalars(
        select(StaffTask).options(*_task_load_options()).order_by(StaffTask.id)
    ).all()
    return [_task_to_out(task) for task in tasks]


# --- Opening hours ----------------------------------------------------------


@router.get("/opening-hours", response_model=list[AdminOpeningHourOut])
def list_all_opening_hours(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[AdminOpeningHourOut]:
    """Every opening-hour interval, including intervals for closed days."""
    hours = db.scalars(
        select(OpeningHour).order_by(
            OpeningHour.day_of_week, OpeningHour.opens_at, OpeningHour.id
        )
    ).all()
    return [AdminOpeningHourOut.model_validate(hour) for hour in hours]


@router.post(
    "/opening-hours",
    response_model=AdminOpeningHourOut,
    status_code=status.HTTP_201_CREATED,
)
def create_opening_hour(
    payload: OpeningHourCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminOpeningHourOut:
    """Add a weekly opening-hour interval."""
    hour = OpeningHour(
        day_of_week=payload.day_of_week,
        opens_at=payload.opens_at,
        closes_at=payload.closes_at,
        note=payload.note.strip(),
        is_closed=payload.is_closed,
    )
    db.add(hour)
    db.commit()
    db.refresh(hour)
    return AdminOpeningHourOut.model_validate(hour)


@router.patch("/opening-hours/{hour_id}", response_model=AdminOpeningHourOut)
def update_opening_hour(
    hour_id: int,
    payload: OpeningHourUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminOpeningHourOut:
    """Update one opening-hour interval."""
    hour = db.get(OpeningHour, hour_id)
    if hour is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Opening hour not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    for field in ("day_of_week", "opens_at", "closes_at", "is_closed"):
        if field in changes:
            setattr(hour, field, changes[field])
    if "note" in changes:
        hour.note = (changes["note"] or "").strip()

    if not hour.is_closed and (hour.opens_at is None or hour.closes_at is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An open interval needs both an opening and a closing time",
        )

    db.commit()
    db.refresh(hour)
    return AdminOpeningHourOut.model_validate(hour)


@router.delete("/opening-hours/{hour_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_opening_hour(
    hour_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove an opening-hour interval."""
    hour = db.get(OpeningHour, hour_id)
    if hour is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Opening hour not found"
        )
    db.delete(hour)
    db.commit()


# --- Products ---------------------------------------------------------------


@router.get("/products", response_model=list[ProductOut])
def list_all_products(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[ProductOut]:
    """Every product, including inactive catalogue entries."""
    products = db.scalars(select(Product).order_by(Product.id)).all()
    return [ProductOut.model_validate(product) for product in products]


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductOut:
    """Add a product to the catalogue."""
    sku = payload.sku.strip()
    name = payload.name.strip()
    if not sku:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Product SKU cannot be empty",
        )
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Product name cannot be empty",
        )
    if db.scalar(select(Product).where(Product.sku == sku)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="SKU already exists"
        )

    product = Product(
        sku=sku,
        name=name,
        brand=payload.brand.strip(),
        category=payload.category.strip(),
        fit=payload.fit.strip(),
        price_vnd=payload.price_vnd,
        description=payload.description.strip(),
        image_url=(payload.image_url or "").strip() or None,
        stock=payload.stock,
        is_active=payload.is_active,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductOut.model_validate(product)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductOut:
    """Update a product without disturbing fields that were omitted."""
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    changes = payload.model_dump(exclude_unset=True)

    if "sku" in changes:
        sku = (changes["sku"] or "").strip()
        if not sku:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Product SKU cannot be empty",
            )
        if db.scalar(
            select(Product).where(Product.sku == sku, Product.id != product_id)
        ) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="SKU already exists"
            )
        product.sku = sku
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Product name cannot be empty",
            )
        product.name = name
    for field in ("brand", "category", "fit", "description"):
        if field in changes:
            setattr(product, field, (changes[field] or "").strip())
    if "image_url" in changes:
        product.image_url = (changes["image_url"] or "").strip() or None
    for field in ("price_vnd", "stock", "is_active"):
        if field in changes:
            setattr(product, field, changes[field])

    db.commit()
    db.refresh(product)
    return ProductOut.model_validate(product)


# --- Prices -----------------------------------------------------------------


@router.get("/prices", response_model=list[PriceOut])
def list_all_prices(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[PriceOut]:
    """Every price entry, including inactive ones."""
    prices = db.scalars(select(Price).order_by(Price.sort_order, Price.id)).all()
    return [PriceOut.model_validate(price) for price in prices]


@router.post("/prices", response_model=PriceOut, status_code=status.HTTP_201_CREATED)
def create_price(
    payload: PriceCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PriceOut:
    """Add a price entry."""
    name = payload.name.strip()
    category = payload.category.strip()
    if not name or not category:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Price name and category cannot be empty",
        )
    price = Price(
        category=category,
        name=name,
        description=payload.description.strip(),
        amount_vnd=payload.amount_vnd,
        unit=payload.unit.strip(),
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(price)
    db.commit()
    db.refresh(price)
    return PriceOut.model_validate(price)


@router.patch("/prices/{price_id}", response_model=PriceOut)
def update_price(
    price_id: int,
    payload: PriceUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PriceOut:
    """Update a price entry."""
    price = db.get(Price, price_id)
    if price is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Price not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        name = (changes["name"] or "").strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Price name cannot be empty",
            )
        price.name = name
    if "category" in changes:
        category = (changes["category"] or "").strip()
        if not category:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Price category cannot be empty",
            )
        price.category = category
    for field in ("description", "unit"):
        if field in changes:
            setattr(price, field, (changes[field] or "").strip())
    for field in ("amount_vnd", "sort_order", "is_active"):
        if field in changes:
            setattr(price, field, changes[field])

    db.commit()
    db.refresh(price)
    return PriceOut.model_validate(price)


# --- Services ---------------------------------------------------------------


@router.get("/services", response_model=list[ServiceOut])
def list_all_services(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[ServiceOut]:
    """Every service, including inactive ones."""
    services = db.scalars(select(Service).order_by(Service.sort_order, Service.id)).all()
    return [ServiceOut.model_validate(service) for service in services]


@router.post("/services", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ServiceOut:
    """Add a service."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Service title cannot be empty",
        )
    service = Service(
        title=title,
        summary=payload.summary.strip(),
        icon=payload.icon.strip() or "mountain",
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return ServiceOut.model_validate(service)


@router.patch("/services/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ServiceOut:
    """Update a service."""
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        title = (changes["title"] or "").strip()
        if not title:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Service title cannot be empty",
            )
        service.title = title
    for field in ("summary", "icon"):
        if field in changes:
            setattr(service, field, (changes[field] or "").strip())
    for field in ("sort_order", "is_active"):
        if field in changes:
            setattr(service, field, changes[field])

    db.commit()
    db.refresh(service)
    return ServiceOut.model_validate(service)


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a service."""
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        )
    db.delete(service)
    db.commit()


# --- FAQ --------------------------------------------------------------------


@router.get("/faq", response_model=list[AdminFaqOut])
def list_all_faq(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[AdminFaqOut]:
    """Every FAQ entry, published or not."""
    entries = db.scalars(select(FaqEntry).order_by(FaqEntry.id)).all()
    return [AdminFaqOut.model_validate(entry) for entry in entries]


@router.post("/faq", response_model=AdminFaqOut, status_code=status.HTTP_201_CREATED)
def create_faq(
    payload: FaqCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminFaqOut:
    """Add an FAQ entry."""
    question = payload.question.strip()
    answer = payload.answer.strip()
    if not question or not answer:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="FAQ question and answer cannot be empty",
        )
    entry = FaqEntry(
        question=question,
        answer=answer,
        category=payload.category.strip() or "General",
        keywords=payload.keywords.strip(),
        is_published=payload.is_published,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return AdminFaqOut.model_validate(entry)


@router.patch("/faq/{faq_id}", response_model=AdminFaqOut)
def update_faq(
    faq_id: int,
    payload: FaqUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminFaqOut:
    """Update an FAQ entry."""
    entry = db.get(FaqEntry, faq_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="FAQ entry not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    for field in ("question", "answer"):
        if field in changes:
            value = (changes[field] or "").strip()
            if not value:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="FAQ question and answer cannot be empty",
                )
            setattr(entry, field, value)
    for field in ("category", "keywords"):
        if field in changes:
            setattr(entry, field, (changes[field] or "").strip())
    if "is_published" in changes:
        entry.is_published = changes["is_published"]

    db.commit()
    db.refresh(entry)
    return AdminFaqOut.model_validate(entry)


@router.delete("/faq/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faq(
    faq_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove an FAQ entry."""
    entry = db.get(FaqEntry, faq_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="FAQ entry not found"
        )
    db.delete(entry)
    db.commit()


# --- Rules ------------------------------------------------------------------


@router.get("/rules", response_model=list[AdminRuleOut])
def list_all_rules(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[AdminRuleOut]:
    """Every rule, including inactive rules."""
    rules = db.scalars(select(Rule).order_by(Rule.sort_order, Rule.id)).all()
    return [AdminRuleOut.model_validate(rule) for rule in rules]


@router.post("/rules", response_model=AdminRuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: RuleCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminRuleOut:
    """Add a gym rule."""
    title = payload.title.strip()
    body = payload.body.strip()
    if not title or not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Rule title and body cannot be empty",
        )
    rule = Rule(
        title=title,
        body=body,
        category=payload.category.strip() or "General",
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        is_confirmed=payload.is_confirmed,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return AdminRuleOut.model_validate(rule)


@router.patch("/rules/{rule_id}", response_model=AdminRuleOut)
def update_rule(
    rule_id: int,
    payload: RuleUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminRuleOut:
    """Update a gym rule."""
    rule = db.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    for field in ("title", "body"):
        if field in changes:
            value = (changes[field] or "").strip()
            if not value:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Rule title and body cannot be empty",
                )
            setattr(rule, field, value)
    if "category" in changes:
        rule.category = (changes["category"] or "").strip() or "General"
    for field in ("sort_order", "is_active", "is_confirmed"):
        if field in changes:
            setattr(rule, field, changes[field])

    db.commit()
    db.refresh(rule)
    return AdminRuleOut.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a gym rule."""
    rule = db.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )
    db.delete(rule)
    db.commit()


# --- Events -----------------------------------------------------------------


def _as_aware(value: datetime | None) -> datetime | None:
    """Treat SQLite's naive timestamps as UTC for comparison purposes."""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _validate_event_window(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event start is required",
        )
    if ends_at is not None and _as_aware(ends_at) <= _as_aware(starts_at):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event end must be after its start",
        )


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
    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event title cannot be empty",
        )
    _validate_event_window(payload.starts_at, payload.ends_at)

    event = Event(
        title=title,
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


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    payload: EventUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> EventOut:
    """Update an event or change its public visibility."""
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        title = (changes["title"] or "").strip()
        if not title:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Event title cannot be empty",
            )
        event.title = title
    for field in ("description", "location"):
        if field in changes:
            setattr(event, field, (changes[field] or "").strip())
    if "starts_at" in changes:
        if changes["starts_at"] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Event start is required",
            )
        event.starts_at = changes["starts_at"]
    if "ends_at" in changes:
        event.ends_at = changes["ends_at"]
    if "capacity" in changes:
        event.capacity = changes["capacity"]
    if "is_public" in changes:
        event.is_public = changes["is_public"]

    _validate_event_window(event.starts_at, event.ends_at)

    db.commit()
    db.refresh(event)
    return EventOut.model_validate(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove an event. Staff tasks that referenced it are kept."""
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Event not found"
        )
    db.delete(event)
    db.commit()


# --- Courses ----------------------------------------------------------------


@router.get("/courses", response_model=list[AdminCourseOut])
def list_all_courses(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[AdminCourseOut]:
    """Every course, including inactive ones."""
    courses = db.scalars(select(Course).order_by(Course.id)).all()
    return [AdminCourseOut.model_validate(course) for course in courses]


@router.post("/courses", response_model=AdminCourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminCourseOut:
    """Add a course."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Course title cannot be empty",
        )
    course = Course(
        title=title,
        level=payload.level.strip() or "All levels",
        summary=payload.summary.strip(),
        description=payload.description.strip(),
        instructor=payload.instructor.strip(),
        schedule=payload.schedule.strip(),
        duration_weeks=payload.duration_weeks,
        capacity=payload.capacity,
        price_vnd=payload.price_vnd,
        is_active=payload.is_active,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return AdminCourseOut.model_validate(course)


@router.patch("/courses/{course_id}", response_model=AdminCourseOut)
def update_course(
    course_id: int,
    payload: CourseUpdateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminCourseOut:
    """Update a course, including its active state."""
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        title = (changes["title"] or "").strip()
        if not title:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Course title cannot be empty",
            )
        course.title = title
    for field in ("level", "summary", "description", "instructor", "schedule"):
        if field in changes:
            setattr(course, field, (changes[field] or "").strip())
    # Nullable numerics must stay null when explicitly cleared.
    for field in ("duration_weeks", "capacity", "price_vnd", "is_active"):
        if field in changes:
            setattr(course, field, changes[field])


    db.commit()
    db.refresh(course)
    return AdminCourseOut.model_validate(course)


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Remove a course."""
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )
    db.delete(course)
    db.commit()
