"""Shared Pydantic helpers."""

from __future__ import annotations

from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class ORMModel(BaseModel):
    """Base model that can be populated from SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    """A simple status message."""

    detail: str


class OpeningHourOut(ORMModel):
    day_of_week: int
    opens_at: time | None = None
    closes_at: time | None = None
    note: str = ""
    is_closed: bool = False


class AdminOpeningHourOut(OpeningHourOut):
    """An opening-hour interval as the administrator sees it."""

    id: int


class OpeningHourCreateIn(BaseModel):
    """The body for adding a weekly opening-hour interval."""

    day_of_week: int = Field(ge=0, le=6)
    opens_at: time | None = None
    closes_at: time | None = None
    note: str = Field(default="", max_length=200)
    is_closed: bool = False

    @model_validator(mode="after")
    def _open_intervals_need_times(self) -> OpeningHourCreateIn:
        if not self.is_closed and (self.opens_at is None or self.closes_at is None):
            raise ValueError("An open interval needs both an opening and a closing time")
        return self


class OpeningHourUpdateIn(BaseModel):
    """The body for updating a weekly opening-hour interval."""

    day_of_week: int | None = Field(default=None, ge=0, le=6)
    opens_at: time | None = None
    closes_at: time | None = None
    note: str | None = Field(default=None, max_length=200)
    is_closed: bool | None = None


class PriceOut(ORMModel):
    id: int
    category: str
    name: str
    description: str
    amount_vnd: int
    unit: str
    sort_order: int
    is_active: bool


class ServiceOut(ORMModel):
    id: int
    title: str
    summary: str
    icon: str
    sort_order: int
    is_active: bool


class CourseOut(ORMModel):
    id: int
    title: str
    level: str
    summary: str
    description: str
    instructor: str
    schedule: str
    duration_weeks: int | None = None
    capacity: int | None = None
    price_vnd: int | None = None


class EventOut(ORMModel):
    id: int
    title: str
    description: str
    starts_at: datetime
    ends_at: datetime | None = None
    location: str
    capacity: int | None = None
    is_public: bool


class AdminCourseOut(CourseOut):
    """A course as the admin dashboard sees it, including inactive records."""

    is_active: bool


class CourseCreateIn(BaseModel):
    """The body for adding a course."""

    title: str = Field(min_length=1, max_length=140)
    level: str = Field(default="All levels", max_length=60)
    summary: str = Field(default="", max_length=4000)
    description: str = Field(default="", max_length=4000)
    instructor: str = Field(default="", max_length=120)
    schedule: str = Field(default="", max_length=200)
    duration_weeks: int | None = Field(default=None, ge=1)
    capacity: int | None = Field(default=None, ge=1)
    price_vnd: int | None = Field(default=None, ge=0)
    is_active: bool = True


class CourseUpdateIn(BaseModel):
    """The body for updating a course.

    Nullable numerics default to ``None`` rather than being required so that
    ``model_dump(exclude_unset=True)`` can tell "clear this value" apart from
    "leave it unchanged".
    """

    title: str | None = Field(default=None, min_length=1, max_length=140)
    level: str | None = Field(default=None, max_length=60)
    summary: str | None = Field(default=None, max_length=4000)
    description: str | None = Field(default=None, max_length=4000)
    instructor: str | None = Field(default=None, max_length=120)
    schedule: str | None = Field(default=None, max_length=200)
    duration_weeks: int | None = Field(default=None, ge=1)
    capacity: int | None = Field(default=None, ge=1)
    price_vnd: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class RuleOut(ORMModel):
    id: int
    title: str
    body: str
    category: str
    sort_order: int
    is_confirmed: bool = False


class FaqOut(ORMModel):
    id: int
    question: str
    answer: str
    category: str
    keywords: str


class RuleCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=4000)
    category: str = Field(default="General", max_length=80)
    sort_order: int = Field(default=0, ge=0, le=999)
    is_active: bool = True
    is_confirmed: bool = False


class RuleUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    body: str | None = Field(default=None, max_length=4000)
    category: str | None = Field(default=None, max_length=80)
    sort_order: int | None = Field(default=None, ge=0, le=999)
    is_active: bool | None = None
    is_confirmed: bool | None = None


class FaqCreateIn(BaseModel):
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=4000)
    category: str = Field(default="General", max_length=80)
    keywords: str = Field(default="", max_length=200)
    is_published: bool = False


class FaqUpdateIn(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=200)
    answer: str | None = Field(default=None, max_length=4000)
    category: str | None = Field(default=None, max_length=80)
    keywords: str | None = Field(default=None, max_length=200)
    is_published: bool | None = None


class AdminFaqOut(FaqOut):
    is_published: bool


class AdminRuleOut(RuleOut):
    is_active: bool


class GymOut(ORMModel):
    name: str = "ARCH Rock Climbing Hanoi"
    tagline: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    instagram: str = ""
    map_url: str = ""
    about: str = ""
    surface_area_m2: int | None = None
    route_count: int | None = None
    opening_note: str = ""
    opening_hours: list[OpeningHourOut] = []
    is_placeholder: bool = True


class ContactMessageIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    subject: str = Field(default="General", max_length=120)
    message: str = Field(min_length=10, max_length=4000)


class ContactMessageOut(ORMModel):
    id: int
    name: str
    email: str
    subject: str
    message: str
    handled: bool
    created_at: datetime


class ProductOut(ORMModel):
    id: int
    sku: str
    name: str
    brand: str
    category: str
    fit: str
    price_vnd: int
    description: str
    image_url: str | None = None
    stock: int
    is_active: bool


class ProductCreateIn(BaseModel):
    """The body for adding a product to the catalogue."""

    sku: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=140)
    brand: str = Field(default="ARCH Selection", max_length=80)
    category: str = Field(default="All-round", max_length=60)
    fit: str = Field(default="Moderate", max_length=40)
    price_vnd: int = Field(default=0, ge=0)
    description: str = Field(default="", max_length=4000)
    image_url: str | None = Field(default=None, max_length=400)
    stock: int = Field(default=0, ge=0)
    is_active: bool = True


class ProductUpdateIn(BaseModel):
    """The body for updating a product."""

    sku: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=140)
    brand: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=60)
    fit: str | None = Field(default=None, max_length=40)
    price_vnd: int | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=4000)
    image_url: str | None = Field(default=None, max_length=400)
    stock: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class PriceCreateIn(BaseModel):
    """The body for adding a price entry."""

    category: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=4000)
    amount_vnd: int = Field(ge=0)
    unit: str = Field(default="", max_length=40)
    sort_order: int = Field(default=0, ge=0, le=999)
    is_active: bool = True


class PriceUpdateIn(BaseModel):
    """The body for updating a price entry."""

    category: str | None = Field(default=None, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    amount_vnd: int | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=40)
    sort_order: int | None = Field(default=None, ge=0, le=999)
    is_active: bool | None = None


class ServiceCreateIn(BaseModel):
    """The body for adding a service."""

    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(default="", max_length=4000)
    icon: str = Field(default="mountain", max_length=40)
    sort_order: int = Field(default=0, ge=0, le=999)
    is_active: bool = True


class ServiceUpdateIn(BaseModel):
    """The body for updating a service."""

    title: str | None = Field(default=None, min_length=1, max_length=120)
    summary: str | None = Field(default=None, max_length=4000)
    icon: str | None = Field(default=None, max_length=40)
    sort_order: int | None = Field(default=None, ge=0, le=999)
    is_active: bool | None = None
