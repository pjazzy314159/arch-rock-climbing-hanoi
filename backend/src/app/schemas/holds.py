"""Schemas for hand-drawn hold annotations and route hold sequences."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models import HoldRole, HoldSetStatus
from app.schemas.common import ORMModel

#: The smallest box the editor accepts, as a fraction of the photograph. A
#: click that produced nothing would otherwise be stored as a zero-size hold.
MIN_BOX_SIZE = 0.005


class HoldBoxIn(BaseModel):
    """A normalised box on the wall photograph."""

    x: float = Field(ge=0, lt=1)
    y: float = Field(ge=0, lt=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def _inside_photograph(self) -> HoldBoxIn:
        if self.width < MIN_BOX_SIZE or self.height < MIN_BOX_SIZE:
            raise ValueError(
                f"A hold must be at least {MIN_BOX_SIZE} of the image in each direction"
            )
        if self.x + self.width > 1.0000001 or self.y + self.height > 1.0000001:
            raise ValueError("A hold must stay inside the photograph")
        return self


class WallHoldCreateIn(HoldBoxIn):
    """The body for drawing a hold on a wall."""

    label: str = Field(default="", max_length=40)


class WallHoldUpdateIn(BaseModel):
    """A partial change to a hold. The combined box is validated by the service."""

    label: str | None = Field(default=None, max_length=40)
    x: float | None = Field(default=None, ge=0, lt=1)
    y: float | None = Field(default=None, ge=0, lt=1)
    width: float | None = Field(default=None, gt=0, le=1)
    height: float | None = Field(default=None, gt=0, le=1)


class WallHoldOut(ORMModel):
    id: int
    wall_id: int
    label: str
    x: float
    y: float
    width: float
    height: float
    created_at: datetime
    updated_at: datetime


class RouteHoldIn(BaseModel):
    """One hold in a route's ordered sequence.

    The role is derived from the position: the first hold is the start and the
    last is the finish. A role may be supplied, but it must agree with that
    order, so an invalid sequence cannot be stored.
    """

    wall_hold_id: int
    role: HoldRole | None = None


class RouteHoldSetIn(BaseModel):
    """Replace a route's draft with this ordered list."""

    holds: list[RouteHoldIn] = Field(default_factory=list, max_length=100)
    wall_image_url: str | None = Field(default=None, max_length=400)


class RouteHoldOut(BaseModel):
    id: int
    wall_hold_id: int
    label: str
    x: float
    y: float
    width: float
    height: float
    position: int
    role: HoldRole


class RouteHoldSetOut(ORMModel):
    id: int
    route_id: int
    status: HoldSetStatus
    wall_image_url: str | None = None
    published_at: datetime | None = None
    updated_at: datetime
    holds: list[RouteHoldOut] = Field(default_factory=list)


class RouteHoldSetStateOut(BaseModel):
    """What the editor loads: the working draft and what members see now."""

    route_id: int
    draft: RouteHoldSetOut | None = None
    published: RouteHoldSetOut | None = None


class PublicRouteHoldsOut(BaseModel):
    """The published annotation members may see.

    ``published`` is false for a route that is archived or has no published
    set. The list is empty in that case; no sample boxes are invented.
    """

    route_id: int
    image_url: str | None = None
    published: bool = False
    holds: list[RouteHoldOut] = Field(default_factory=list)
