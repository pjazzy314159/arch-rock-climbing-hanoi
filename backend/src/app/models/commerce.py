"""Shop catalogue."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin


class Product(Base, TimestampMixin):
    """A product in the ARCH catalogue.

    The catalogue is informational in the first release: there is no checkout
    and no payment integration.
    """

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    brand: Mapped[str] = mapped_column(String(80), default="ARCH Selection")
    category: Mapped[str] = mapped_column(String(60), default="All-round", index=True)
    fit: Mapped[str] = mapped_column(String(40), default="Moderate")
    price_vnd: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
