"""Route-setting endpoints: wall holds, ordered route sequences and publishing.

Staff can draw and edit holds. Only an administrator can publish a sequence to
members, mirroring the existing admin-only route CRUD. Members read the
published sequence of an active route without signing in.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin, require_staff
from app.models import ClimbRoute, User, Wall
from app.schemas import (
    PublicRouteHoldsOut,
    RouteHoldSetIn,
    RouteHoldSetOut,
    RouteHoldSetStateOut,
    RouteOut,
    WallHoldCreateIn,
    WallHoldOut,
    WallHoldUpdateIn,
    WallOut,
)
from app.services.holds import (
    create_wall_hold,
    delete_wall_hold,
    get_wall,
    hold_set_state,
    list_wall_holds,
    public_holds,
    publish_draft,
    save_draft,
    update_wall_hold,
)

staff_router = APIRouter(prefix="/api/staff", tags=["route setting"])
public_router = APIRouter(prefix="/api/public", tags=["public"])


def _route_out(route: ClimbRoute) -> RouteOut:
    payload = RouteOut.model_validate(route)
    payload.wall_image_url = route.wall.image_url if route.wall is not None else None
    return payload


@staff_router.get("/walls", response_model=list[WallOut])
def staff_walls(
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> list[WallOut]:
    """The walls staff can annotate, in the order the gym lists them."""
    rows = db.scalars(
        select(Wall).where(Wall.is_active.is_(True)).order_by(Wall.sort_order, Wall.name)
    ).all()
    return [WallOut.model_validate(row) for row in rows]


@staff_router.get("/walls/{wall_id}/routes", response_model=list[RouteOut])
def staff_wall_routes(
    wall_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> list[RouteOut]:
    """Every route on a wall, including archived ones, for the route picker."""
    get_wall(db, wall_id)
    rows = db.scalars(
        select(ClimbRoute)
        .where(ClimbRoute.wall_id == wall_id)
        .order_by(ClimbRoute.status, ClimbRoute.name)
    ).all()
    return [_route_out(row) for row in rows]


@staff_router.get("/walls/{wall_id}/holds", response_model=list[WallHoldOut])
def staff_wall_holds(
    wall_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> list[WallHoldOut]:
    """The hold boxes drawn on this wall's photograph."""
    return list_wall_holds(db, wall_id)


@staff_router.post(
    "/walls/{wall_id}/holds",
    response_model=WallHoldOut,
    status_code=status.HTTP_201_CREATED,
)
def staff_create_hold(
    wall_id: int,
    payload: WallHoldCreateIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> WallHoldOut:
    """Draw a new hold box on the wall photograph."""
    return create_wall_hold(db, wall_id, payload, user)


@staff_router.patch("/holds/{hold_id}", response_model=WallHoldOut)
def staff_update_hold(
    hold_id: int,
    payload: WallHoldUpdateIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> WallHoldOut:
    """Move, resize or rename a hold box."""
    return update_wall_hold(db, hold_id, payload, user)


@staff_router.delete("/holds/{hold_id}", status_code=status.HTTP_204_NO_CONTENT)
def staff_delete_hold(
    hold_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> None:
    """Delete a hold that no published route uses."""
    delete_wall_hold(db, hold_id, user)


@staff_router.get("/routes/{route_id}/hold-set", response_model=RouteHoldSetStateOut)
def staff_hold_set(
    route_id: int,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> RouteHoldSetStateOut:
    """The route's draft (if any) and the sequence members currently see."""
    return hold_set_state(db, route_id)


@staff_router.put("/routes/{route_id}/hold-set", response_model=RouteHoldSetOut)
def staff_save_hold_set(
    route_id: int,
    payload: RouteHoldSetIn,
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
) -> RouteHoldSetOut:
    """Replace the route's draft with an ordered list of holds."""
    return save_draft(db, route_id, payload, user)


@staff_router.post("/routes/{route_id}/hold-set/publish", response_model=RouteHoldSetOut)
def staff_publish_hold_set(
    route_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RouteHoldSetOut:
    """Make the draft the sequence members see; the previous one is superseded."""
    return publish_draft(db, route_id, user)


@public_router.get("/routes/{route_id}/holds", response_model=PublicRouteHoldsOut)
def public_route_holds(route_id: int, db: Session = Depends(get_db)) -> PublicRouteHoldsOut:
    """The published hold sequence of an active route, or an honest empty one."""
    return public_holds(db, route_id)


__all__ = ["public_router", "staff_router"]
