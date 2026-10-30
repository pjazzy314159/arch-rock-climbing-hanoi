"""Public content: gym information, opening hours, prices, services, courses,
events, rules and the FAQ knowledge base used by the AI assistant."""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import TimestampMixin


class GymInfo(Base, TimestampMixin):
    """Singleton record describing the gym itself."""

    __tablename__ = "gym_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(120), default="ARCH Rock Climbing Hanoi")
    tagline: Mapped[str] = mapped_column(String(200), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    instagram: Mapped[str] = mapped_column(String(200), default="")
    map_url: Mapped[str] = mapped_column(String(400), default="")
    about: Mapped[str] = mapped_column(Text, default="")
    surface_area_m2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    route_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opening_note: Mapped[str] = mapped_column(String(300), default="")


class OpeningHour(Base, TimestampMixin):
    """Opening hours for one weekday (0 = Monday)."""

    __tablename__ = "opening_hours"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day_of_week: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    opens_at: Mapped[time | None] = mapped_column(nullable=True)
    closes_at: Mapped[time | None] = mapped_column(nullable=True)
    note: Mapped[str] = mapped_column(String(200), default="")
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Price(Base, TimestampMixin):
    """A published price entry, in Vietnamese đồng."""

    __tablename__ = "prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(80), default="Membership", index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    amount_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    unit: Mapped[str] = mapped_column(String(40), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class Service(Base, TimestampMixin):
    """A service the gym offers (bouldering, coaching, training zone, …)."""

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(40), default="mountain")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class Course(Base, TimestampMixin):
    """A course or coaching programme."""

    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    level: Mapped[str] = mapped_column(String(60), default="All levels")
    summary: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    instructor: Mapped[str] = mapped_column(String(120), default="")
    schedule: Mapped[str] = mapped_column(String(200), default="")
    duration_weeks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_vnd: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)


class Event(Base, TimestampMixin):
    """A gym event (competition, workshop, community session)."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location: Mapped[str] = mapped_column(String(160), default="")
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_by: Mapped[User] = relationship()  # noqa: F821


class Rule(Base, TimestampMixin):
    """A published gym rule.

    ``is_confirmed`` marks whether ARCH has actually approved the wording.
    Unconfirmed rules are still shown publicly but are clearly labelled as
    drafts, so the site never presents invented policy as official.
    """

    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="General", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class FaqEntry(Base, TimestampMixin):
    """A published question and answer.

    This table doubles as the knowledge base for the customer-support
    assistant. Only published entries are ever exposed to the assistant.
    """

    __tablename__ = "faq_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question: Mapped[str] = mapped_column(String(300), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="General", index=True)
    keywords: Mapped[str] = mapped_column(String(400), default="")
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class ContactMessage(Base, TimestampMixin):
    """A message submitted through the public contact form."""

    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), default="General")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    handled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class ContentRevision(Base, TimestampMixin):
    """Audit trail of published content changes."""

    __tablename__ = "content_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(40), default="update", nullable=False)
    changed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_on: Mapped[date] = mapped_column(Date, default=lambda: date.today(), nullable=False)
