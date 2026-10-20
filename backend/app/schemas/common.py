"""Shared Pydantic helpers."""

from __future__ import annotations

from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class PriceOut(ORMModel):
    id: int
    category: str
    name: str
    description: str
    amount_vnd: int
    unit: str
    sort_order: int


class ServiceOut(ORMModel):
    id: int
    title: str
    summary: str
    icon: str
    sort_order: int


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


class DashboardOut(BaseModel):
    """Aggregate numbers for a member dashboard."""

    total_sends: int
    total_sessions: int
    best_grade: str | None
    active_projects: int
    agreement_status: str | None = None
