"""Route-setting rules: hold boxes, ordered sequences and publication.

The rules live here rather than in the router so the same validation applies
to every caller: a box must stay inside the photograph, a sequence must be
ordered, and only an administrator can publish it to members.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ClimbRoute,
    HoldRole,
    HoldSetStatus,
    RouteHold,
    RouteHoldSet,
    RouteStatus,
    User,
    Wall,
    WallHold,
)
from app.schemas.holds import (
    MIN_BOX_SIZE,
    PublicRouteHoldsOut,
    RouteHoldOut,
    RouteHoldSetIn,
    RouteHoldSetOut,
    RouteHoldSetStateOut,
    WallHoldCreateIn,
    WallHoldOut,
    WallHoldUpdateIn,
)

#: Coordinates are stored to five decimal places: about one pixel on a
#: 3000-pixel-wide photograph, and far more precision than a hand-drawn box has.
COORDINATE_PRECISION = 5


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _normalise(value: float) -> float:
    return round(float(value), COORDINATE_PRECISION)


def normalise_box(
    x: float, y: float, width: float, height: float
) -> tuple[float, float, float, float]:
    """Round a box and reject one that falls outside the photograph."""
    x, y, width, height = (_normalise(value) for value in (x, y, width, height))
    if width < MIN_BOX_SIZE or height < MIN_BOX_SIZE:
        raise _unprocessable(
            f"A hold must be at least {MIN_BOX_SIZE} of the photograph in each direction"
        )
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise _unprocessable("A hold must have a positive size inside the photograph")
    if x + width > 1 or y + height > 1:
        raise _unprocessable("A hold must stay inside the photograph")
    return x, y, width, height


def get_wall(db: Session, wall_id: int) -> Wall:
    wall = db.get(Wall, wall_id)
    if wall is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wall not found")
    return wall


def get_route(db: Session, route_id: int) -> ClimbRoute:
    route = db.get(ClimbRoute, route_id)
    if route is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    return route


def list_wall_holds(db: Session, wall_id: int) -> list[WallHoldOut]:
    get_wall(db, wall_id)
    rows = db.scalars(
        select(WallHold).where(WallHold.wall_id == wall_id).order_by(WallHold.id)
    ).all()
    return [WallHoldOut.model_validate(row) for row in rows]


def create_wall_hold(
    db: Session, wall_id: int, payload: WallHoldCreateIn, user: User
) -> WallHoldOut:
    get_wall(db, wall_id)
    x, y, width, height = normalise_box(payload.x, payload.y, payload.width, payload.height)
    hold = WallHold(
        wall_id=wall_id,
        label=payload.label.strip(),
        x=x,
        y=y,
        width=width,
        height=height,
        created_by_id=user.id,
    )
    db.add(hold)
    db.commit()
    db.refresh(hold)
    return WallHoldOut.model_validate(hold)


def update_wall_hold(
    db: Session, hold_id: int, payload: WallHoldUpdateIn, user: User
) -> WallHoldOut:
    hold = db.get(WallHold, hold_id)
    if hold is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hold not found")

    x = hold.x if payload.x is None else payload.x
    y = hold.y if payload.y is None else payload.y
    width = hold.width if payload.width is None else payload.width
    height = hold.height if payload.height is None else payload.height
    hold.x, hold.y, hold.width, hold.height = normalise_box(x, y, width, height)
    if payload.label is not None:
        hold.label = payload.label.strip()
    db.commit()
    db.refresh(hold)
    return WallHoldOut.model_validate(hold)


def _renumber(db: Session, set_id: int) -> None:
    """Keep positions contiguous and roles consistent after a hold is removed."""
    rows = list(
        db.scalars(
            select(RouteHold).where(RouteHold.set_id == set_id).order_by(RouteHold.position)
        ).all()
    )
    last = len(rows) - 1
    for index, row in enumerate(rows):
        row.position = index + 1
        if index == 0:
            row.role = HoldRole.START
        elif index == last:
            row.role = HoldRole.FINISH
        else:
            row.role = HoldRole.MIDDLE


def delete_wall_hold(db: Session, hold_id: int, user: User) -> None:
    """Remove a hold from the wall.

    A hold that a published sequence uses is refused: deleting it would break
    an overlay members can already see. Drafts may drop it, and their order is
    closed up so positions stay contiguous.
    """
    hold = db.get(WallHold, hold_id)
    if hold is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hold not found")

    used_by_published = db.execute(
        select(RouteHold.id)
        .join(RouteHoldSet, RouteHold.set_id == RouteHoldSet.id)
        .where(
            RouteHold.wall_hold_id == hold_id,
            RouteHoldSet.status == HoldSetStatus.PUBLISHED,
        )
        .limit(1)
    ).first()
    if used_by_published is not None:
        raise _conflict("This hold is part of a published route. Remove it from the route first.")

    affected = set(
        db.scalars(
            select(RouteHold.set_id)
            .join(RouteHoldSet, RouteHold.set_id == RouteHoldSet.id)
            .where(
                RouteHold.wall_hold_id == hold_id,
                RouteHoldSet.status == HoldSetStatus.DRAFT,
            )
        ).all()
    )
    # Superseded sets are history; their reference to this hold goes too, so no
    # row is left pointing at a hold that no longer exists. Positions in drafts
    # are closed up; superseded history is read-only.
    db.execute(RouteHold.__table__.delete().where(RouteHold.wall_hold_id == hold_id))
    for set_id in affected:
        _renumber(db, set_id)
    db.delete(hold)
    db.commit()


def _set_out(hold_set: RouteHoldSet) -> RouteHoldSetOut:
    holds: list[RouteHoldOut] = []
    for row in sorted(hold_set.holds, key=lambda item: item.position):
        wall_hold = row.wall_hold
        holds.append(
            RouteHoldOut(
                id=row.id,
                wall_hold_id=row.wall_hold_id,
                label=wall_hold.label,
                x=wall_hold.x,
                y=wall_hold.y,
                width=wall_hold.width,
                height=wall_hold.height,
                position=row.position,
                role=row.role,
            )
        )
    return RouteHoldSetOut(
        id=hold_set.id,
        route_id=hold_set.route_id,
        status=hold_set.status,
        wall_image_url=hold_set.wall_image_url,
        published_at=hold_set.published_at,
        updated_at=hold_set.updated_at,
        holds=holds,
    )


def _latest(db: Session, route_id: int, set_status: HoldSetStatus) -> RouteHoldSet | None:
    return db.scalars(
        select(RouteHoldSet)
        .where(
            RouteHoldSet.route_id == route_id,
            RouteHoldSet.status == set_status,
        )
        .order_by(RouteHoldSet.id.desc())
        .limit(1)
    ).first()


def hold_set_state(db: Session, route_id: int) -> RouteHoldSetStateOut:
    route = get_route(db, route_id)
    draft = _latest(db, route.id, HoldSetStatus.DRAFT)
    published = _latest(db, route.id, HoldSetStatus.PUBLISHED)
    return RouteHoldSetStateOut(
        route_id=route.id,
        draft=_set_out(draft) if draft else None,
        published=_set_out(published) if published else None,
    )


def _wall_image(route: ClimbRoute) -> str | None:
    return route.wall.image_url if route.wall is not None else None


def _ensure_draft(db: Session, route: ClimbRoute, user: User) -> RouteHoldSet:
    draft = _latest(db, route.id, HoldSetStatus.DRAFT)
    if draft is not None:
        return draft

    draft = RouteHoldSet(
        route_id=route.id,
        status=HoldSetStatus.DRAFT,
        wall_image_url=_wall_image(route),
        created_by_id=user.id,
    )
    db.add(draft)
    db.flush()

    # Start from what members already see, so a small correction does not mean
    # drawing the whole route again. A brand-new route starts empty.
    published = _latest(db, route.id, HoldSetStatus.PUBLISHED)
    if published is not None:
        draft.wall_image_url = published.wall_image_url or _wall_image(route)
        for row in sorted(published.holds, key=lambda item: item.position):
            db.add(
                RouteHold(
                    set_id=draft.id,
                    wall_hold_id=row.wall_hold_id,
                    position=row.position,
                    role=row.role,
                )
            )
        db.flush()
    return draft


def _replace_holds(db: Session, draft: RouteHoldSet, payload: RouteHoldSetIn) -> None:
    ids = [item.wall_hold_id for item in payload.holds]
    if len(set(ids)) != len(ids):
        raise _unprocessable("A hold can appear only once in a route")

    holds = (
        {hold.id: hold for hold in db.scalars(select(WallHold).where(WallHold.id.in_(ids))).all()}
        if ids
        else {}
    )
    missing = [hold_id for hold_id in ids if hold_id not in holds]
    if missing:
        raise _unprocessable("One or more holds do not exist")

    route = get_route(db, draft.route_id)
    if route.wall_id is None:
        raise _unprocessable("A route needs a wall before holds can be assigned")
    wrong_wall = [hold.id for hold in holds.values() if hold.wall_id != route.wall_id]
    if wrong_wall:
        raise _unprocessable("Every hold must be on the route's own wall")

    for row in list(draft.holds):
        db.delete(row)
    db.flush()

    total = len(payload.holds)
    for index, item in enumerate(payload.holds, start=1):
        if index == 1:
            expected = HoldRole.START
        elif index == total:
            expected = HoldRole.FINISH
        else:
            expected = HoldRole.MIDDLE
        if item.role is not None and item.role != expected:
            raise _unprocessable(
                "The first hold is the start, the last is the finish, and the rest are middle holds"
            )
        db.add(
            RouteHold(
                set_id=draft.id,
                wall_hold_id=item.wall_hold_id,
                position=index,
                role=expected,
            )
        )

    if payload.wall_image_url is not None:
        draft.wall_image_url = payload.wall_image_url
    elif draft.wall_image_url is None:
        draft.wall_image_url = _wall_image(route)
    db.flush()


def save_draft(db: Session, route_id: int, payload: RouteHoldSetIn, user: User) -> RouteHoldSetOut:
    route = get_route(db, route_id)
    if route.wall_id is None:
        raise _unprocessable("A route needs a wall before holds can be assigned")
    draft = _ensure_draft(db, route, user)
    _replace_holds(db, draft, payload)
    db.commit()
    db.refresh(draft)
    return _set_out(draft)


def publish_draft(db: Session, route_id: int, user: User) -> RouteHoldSetOut:
    route = get_route(db, route_id)
    draft = _latest(db, route.id, HoldSetStatus.DRAFT)
    if draft is None:
        raise _unprocessable("There is no draft to publish")
    if len(draft.holds) < 2:
        raise _unprocessable("A published route needs a start and a finish hold")

    if route.wall_id is not None:
        wrong_wall = [
            row.wall_hold_id for row in draft.holds if row.wall_hold.wall_id != route.wall_id
        ]
        if wrong_wall:
            raise _unprocessable("Every hold must be on the route's own wall")

    previous = _latest(db, route.id, HoldSetStatus.PUBLISHED)
    if previous is not None:
        previous.status = HoldSetStatus.SUPERSEDED
    draft.status = HoldSetStatus.PUBLISHED
    draft.published_at = datetime.now(UTC)
    route.published_hold_set_id = draft.id
    db.commit()
    db.refresh(draft)
    return _set_out(draft)


def public_holds(db: Session, route_id: int) -> PublicRouteHoldsOut:
    route = get_route(db, route_id)
    if route.status != RouteStatus.ACTIVE or route.published_hold_set_id is None:
        return PublicRouteHoldsOut(route_id=route.id, image_url=_wall_image(route))

    hold_set = db.get(RouteHoldSet, route.published_hold_set_id)
    if hold_set is None or hold_set.status != HoldSetStatus.PUBLISHED:
        return PublicRouteHoldsOut(route_id=route.id, image_url=_wall_image(route))

    return PublicRouteHoldsOut(
        route_id=route.id,
        image_url=hold_set.wall_image_url or _wall_image(route),
        published=True,
        holds=_set_out(hold_set).holds,
    )
