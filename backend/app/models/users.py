"""User accounts, roles and safety agreements."""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import TimestampMixin


class Role(enum.StrEnum):
    """Access roles understood by the ARCH platform."""

    CUSTOMER = "customer"
    STAFF = "staff"
    ADMIN = "admin"


class AgreementStatus(enum.StrEnum):
    """Lifecycle of a customer safety agreement.

    The exact signing workflow is still to be confirmed by ARCH, so the model
    tracks a status rather than pretending a specific process is settled.
    """

    PENDING = "pending"
    SIGNED = "signed"
    WAIVED = "waived"
    EXPIRED = "expired"


class AgreementMethod(enum.StrEnum):
    """How an agreement was confirmed."""

    DIGITAL_SIGNATURE = "digital_signature"
    DOCUMENT_UPLOAD = "document_upload"
    STAFF_CONFIRMED = "staff_confirmed"


class User(Base, TimestampMixin):
    """A person who can sign in to the platform."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(
        Enum(Role, native_enum=False, length=20), default=Role.CUSTOMER, nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Optional, deliberately minimal customer profile data.
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    membership_tier: Mapped[str | None] = mapped_column(String(60), nullable=True)
    membership_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    joined_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Climbing level used as context for route votes (scale grade, e.g. 4 == "V4").
    climbing_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    agreements: Mapped[list[SafetyAgreement]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    votes: Mapped[list[RouteVote]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
    achievements: Mapped[list[Achievement]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[StaffTask]] = relationship(  # noqa: F821
        back_populates="assignee",
        cascade="all, delete-orphan",
        foreign_keys="StaffTask.assignee_id",
    )

    @property
    def is_staff(self) -> bool:
        return self.role in (Role.STAFF, Role.ADMIN)

    @property
    def is_admin(self) -> bool:
        return self.role is Role.ADMIN


class SafetyAgreement(Base, TimestampMixin):
    """A customer's safety agreement record.

    The record deliberately stores only a status, the agreement version and the
    confirmation method. It never stores a signature image or document body;
    those stay in the media store if ARCH enables uploads.
    """

    __tablename__ = "safety_agreements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[str] = mapped_column(String(40), default="2026-01", nullable=False)
    status: Mapped[AgreementStatus] = mapped_column(
        Enum(AgreementStatus, native_enum=False, length=20),
        default=AgreementStatus.PENDING,
        nullable=False,
        index=True,
    )
    method: Mapped[AgreementMethod | None] = mapped_column(
        Enum(AgreementMethod, native_enum=False, length=30), nullable=True
    )
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    document_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="agreements")
